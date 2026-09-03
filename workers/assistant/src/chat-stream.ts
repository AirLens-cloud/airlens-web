import type { ChatBudgetStatus, ChatMessageWire, ChatStreamEvent, Env } from './types';
import { buildGroundedContext, embedQuery, queryCorpus, toCitations } from './rag';
import { buildMessages } from './prompts';
import { classifyIntent } from './guardrails';
import { buildStructuredContext, buildUserFacingSummary, fetchLiveDataContext, type LiveDataContext } from './liveData';

const EMPTY_LIVE_DATA: LiveDataContext = { prediction: null, policy: null };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function sseLine(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Parses one native Workers AI SSE frame into a text token, or a `done`
 * signal. The catalog serves gemma through two possible shapes — the native
 * `{"response": "..."}` frame and the OpenAI-compatible
 * `{"choices":[{"delta":{"content":"..."}}]}` frame — so both are read here
 * (same duality the retired chatbot worker's postprocess.ts had to handle).
 * A `reasoning_content` delta (thinking-model chain of thought) is dropped,
 * never forwarded — it is not an answer.
 */
function parseUpstreamFrame(frame: string): { token: string | null; done: boolean } {
  const trimmed = frame.trim();
  if (!trimmed.startsWith('data:')) return { token: null, done: false };
  const payload = trimmed.slice('data:'.length).trim();
  if (payload === '[DONE]' || payload === '') return { token: null, done: payload === '[DONE]' };
  try {
    const parsed = JSON.parse(payload) as {
      response?: unknown;
      choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }>;
    };
    if (typeof parsed.response === 'string') return { token: parsed.response, done: false };
    const delta = parsed.choices?.[0]?.delta;
    if (typeof delta?.content === 'string') return { token: delta.content, done: false };
    return { token: null, done: false };
  } catch {
    return { token: null, done: false };
  }
}

/**
 * Re-shapes the raw Workers AI SSE byte stream into this worker's own
 * `token` events, buffering partial frames across chunk boundaries.
 */
async function* upstreamTokens(upstream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = upstream.getReader();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const frame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const { token, done: upstreamDone } = parseUpstreamFrame(frame);
        if (upstreamDone) return;
        if (token) yield token;
        separatorIndex = buffer.indexOf('\n\n');
      }
    }
    const { token } = parseUpstreamFrame(buffer);
    if (token) yield token;
  } finally {
    reader.releaseLock();
  }
}

/**
 * C3 RAG + live-data stream: classifies intent (guardrails.ts
 * classifyIntent — zero LLM calls), embeds the query (bge-m3) and, for
 * data_lookup/causal/policy intents, concurrently fetches the live-data
 * snapshot context (liveData.ts) — both best-effort, both fail-open. Streams
 * a grounded gemma answer, and — only when retrieval actually found
 * something — emits one `citations` event before the first `token` event
 * (retrieval finishes before generation starts here, unlike the retired
 * worker's post-hoc X-RAG-Citations header; design §2 "스트리밍 정합").
 * causal_reasoning is included in the system prompt only for causal/policy
 * intents (design §1 D-1 token-budget policy). The `done` event reports the
 * classified intent, not a hardcoded 'general' (C2's placeholder).
 */
export async function buildRagStream(
  env: Env,
  userMessage: string,
  history: ChatMessageWire[],
  budgetStatus: ChatBudgetStatus,
  page?: string,
): Promise<ReadableStream<Uint8Array>> {
  const intent = classifyIntent(userMessage);
  const wantsLiveData = intent !== 'general';
  const includeCausalReasoning = intent === 'causal' || intent === 'policy';

  const [queryVector, liveData] = await Promise.all([
    embedQuery(env, userMessage),
    wantsLiveData ? fetchLiveDataContext(env, userMessage, page) : Promise.resolve(EMPTY_LIVE_DATA),
  ]);
  const matches = queryVector ? await queryCorpus(env, queryVector, parseInt(env.RAG_TOP_K, 10) || 5) : [];
  const citations = toCitations(matches);
  const groundedContext = [buildGroundedContext(matches), buildStructuredContext(liveData)]
    .filter(Boolean)
    .join('\n\n');

  const maxTurns = parseInt(env.MAX_HISTORY_TURNS, 10);
  const messages = buildMessages(userMessage, history, maxTurns, groundedContext, includeCausalReasoning);

  const maxTokens = parseInt(env.MAX_TOKENS, 10);
  const temperature = parseFloat(env.TEMPERATURE);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upstream = (await env.AI.run(env.CHAT_MODEL as any, {
    messages,
    max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 512,
    temperature: Number.isFinite(temperature) ? temperature : 0.3,
    stream: true,
  })) as ReadableStream<Uint8Array>;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      if (citations.length > 0) {
        controller.enqueue(sseLine({ type: 'citations', citations }));
      }
      try {
        for await (const token of upstreamTokens(upstream)) {
          controller.enqueue(sseLine({ type: 'token', content: token }));
        }
      } catch (err) {
        console.error('[assistant] gemma stream error:', err instanceof Error ? err.message : err);
      }
      controller.enqueue(sseLine({ type: 'done', budget: budgetStatus, intent }));
      controller.close();
    },
  });
}

const BUDGET_EXHAUSTED_NOTICE_EN =
  "[AirLens] Today's AI response budget is used up. Here is what the documentation search found instead " +
  '(no AI-generated summary this time):';
const BUDGET_EXHAUSTED_NOTICE_KO =
  '[AirLens] 오늘의 AI 응답 예산을 모두 사용했습니다. 아래는 관련 문서 검색 결과입니다 ' +
  '(이번에는 AI 요약이 생성되지 않았습니다):';
const NO_MATCHES_NOTICE = 'No matching documentation was found. / 관련 문서를 찾지 못했습니다.';

/**
 * Degraded path when the daily neuron budget is exhausted (quota.ts
 * checkGlobalBudget) — never calls env.AI.run for generation, only the
 * (cheap, ~0.05-neuron) query embedding, so a request in this path costs
 * effectively zero of the exhausted budget. RAG matches AND (for
 * data_lookup/causal/policy intents) the live-data snapshot are listed
 * verbatim as a single `token` frame, never summarized by the model
 * (Glass-box: no invented certainty) — live-data lookup itself costs zero
 * neurons (a plain HTTP fetch), so including it here is free even though
 * the budget guard exists specifically to stop gemma calls.
 */
export async function buildDegradedStream(env: Env, userMessage: string, page?: string): Promise<ReadableStream<Uint8Array>> {
  const intent = classifyIntent(userMessage);
  const wantsLiveData = intent !== 'general';

  const [queryVector, liveData] = await Promise.all([
    embedQuery(env, userMessage),
    wantsLiveData ? fetchLiveDataContext(env, userMessage, page) : Promise.resolve(EMPTY_LIVE_DATA),
  ]);
  const matches = queryVector ? await queryCorpus(env, queryVector, parseInt(env.RAG_TOP_K, 10) || 5) : [];
  const citations = toCitations(matches);

  // B1 (PR #47 review): buildUserFacingSummary renders plain facts only —
  // formatPrediction/formatPolicyImpact (used above in buildRagStream via
  // buildStructuredContext) carry model-only instruction text ("do not
  // invent one", "Do NOT fabricate…") that must never reach this raw
  // token frame, since nothing downstream strips it before it streams to
  // the user.
  const liveDataSummary = buildUserFacingSummary(liveData);

  const parts: string[] = [`${BUDGET_EXHAUSTED_NOTICE_EN}\n${BUDGET_EXHAUSTED_NOTICE_KO}`];
  if (liveDataSummary.length > 0) parts.push(liveDataSummary.join('\n'));
  if (matches.length > 0) {
    parts.push(matches.map((m, i) => `${i + 1}. ${m.metadata.source_title} (${m.metadata.source_url})`).join('\n'));
  } else if (liveDataSummary.length === 0) {
    parts.push(NO_MATCHES_NOTICE);
  }
  const body = parts.join('\n\n');

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (citations.length > 0) controller.enqueue(sseLine({ type: 'citations', citations }));
      controller.enqueue(sseLine({ type: 'token', content: body }));
      controller.enqueue(sseLine({ type: 'done', budget: 'exhausted', intent }));
      controller.close();
    },
  });
}
