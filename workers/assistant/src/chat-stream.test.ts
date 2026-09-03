// chat-stream.test.ts — buildRagStream/buildDegradedStream SSE shape. AAA
// pattern; env.AI and env.VECTORIZE are hand-rolled mocks so no live model
// or index call happens.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { buildDegradedStream, buildRagStream } from './chat-stream';
import { clearSnapshotMemo } from './liveData';
import type { CorpusVectorMetadata, Env } from './types';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SESSION_TTL_SECONDS: '3600',
    RATE_LIMIT_PER_MINUTE: '5',
    DAILY_MESSAGE_LIMIT: '30',
    DAILY_REQUEST_BUDGET: '10000',
    REQUEST_COST_ESTIMATE: '50',
    MAX_MESSAGE_LENGTH: '2000',
    MAX_HISTORY_TURNS: '10',
    ALLOWED_ORIGINS: 'https://airlens.cloud',
    CHAT_MODEL: '@cf/google/gemma-4-26b-a4b-it',
    EMBEDDING_MODEL: '@cf/baai/bge-m3',
    MAX_TOKENS: '1024',
    TEMPERATURE: '0.3',
    REASONING_EFFORT: 'low',
    RAG_TOP_K: '5',
    ...overrides,
  } as Env;
}

/** Native-shape SSE stream (`data: {"response": "..."}` frames), same shape
 *  Workers AI serves gemma through — see chat-stream.ts parseUpstreamFrame. */
function nativeSseStream(words: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const w of words) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: w })}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

/** `run` mock that answers bge-m3 embedding calls (input.text present) and
 *  gemma chat calls (input.messages present, stream:true) differently. */
function makeAiRun(replyWords: string[]) {
  return vi.fn(async (_model: string, input: { text?: string | string[]; messages?: unknown }) => {
    if (input.text !== undefined) {
      const texts = Array.isArray(input.text) ? input.text : [input.text];
      return { data: texts.map(() => [0.1, 0.2, 0.3]) };
    }
    return nativeSseStream(replyWords);
  });
}

async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const text = await new Response(stream).text();
  return text
    .split('\n\n')
    .filter((frame) => frame.startsWith('data:'))
    .map((frame) => JSON.parse(frame.slice('data:'.length).trim()));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const SAMPLE_METADATA: CorpusVectorMetadata = {
  source_title: 'AQI scale',
  source_url: '/faq#aqi-scale',
  category: 'faq',
  excerpt: 'AirLens uses EPA breakpoint-based AQI tiers.',
};

describe('buildRagStream', () => {
  it('streams gemma output as token events ending in done, with no citations event when nothing was retrieved', async () => {
    // Arrange
    const run = makeAiRun(['Hello', ' ', 'there']);
    const env = makeEnv({ AI: { run } as unknown as Ai }); // no VECTORIZE — queryCorpus returns []
    // Act
    const stream = await buildRagStream(env, 'hi', [], 'ok');
    const events = await collectEvents(stream);
    // Assert
    expect(events.filter((e) => (e as { type: string }).type === 'citations')).toHaveLength(0);
    expect(events.filter((e) => (e as { type: string }).type === 'token').map((e) => (e as { content: string }).content)).toEqual([
      'Hello',
      ' ',
      'there',
    ]);
    expect(events.at(-1)).toEqual({ type: 'done', budget: 'ok', intent: 'general' });
  });

  it('emits a citations event before any token event when Vectorize returns matches', async () => {
    // Arrange
    const run = makeAiRun(['Answer']);
    const query = vi.fn().mockResolvedValue({
      count: 1,
      matches: [{ id: 'faq:aqi-scale', score: 0.88, metadata: SAMPLE_METADATA }],
    });
    const env = makeEnv({ AI: { run } as unknown as Ai, VECTORIZE: { query } as unknown as VectorizeIndex });
    // Act
    const stream = await buildRagStream(env, 'what aqi scale', [], 'ok');
    const events = await collectEvents(stream) as Array<{ type: string; citations?: unknown[] }>;
    // Assert
    expect(events[0].type).toBe('citations');
    expect(events[0].citations).toEqual([
      { source_title: 'AQI scale', source_url: '/faq#aqi-scale', relevance: 0.88, excerpt: SAMPLE_METADATA.excerpt },
    ]);
    expect(events[1].type).toBe('token');
  });

  it('reports budget: exhausted in the done event without changing the token content', async () => {
    // Arrange
    const run = makeAiRun(['ok']);
    const env = makeEnv({ AI: { run } as unknown as Ai });
    // Act
    const stream = await buildRagStream(env, 'hi', [], 'exhausted');
    const events = await collectEvents(stream);
    // Assert
    expect(events.at(-1)).toEqual({ type: 'done', budget: 'exhausted', intent: 'general' });
  });

  it('reports the classified intent in the done event instead of a hardcoded "general" (C3)', async () => {
    // Arrange — "지금 미세먼지 얼마" has both a time cue and an air-quality
    // subject → data_lookup (guardrails.ts classifyIntent).
    const run = makeAiRun(['ok']);
    const env = makeEnv({ AI: { run } as unknown as Ai }); // HF_LIVE_BASE unset — liveData fetch short-circuits
    // Act
    const stream = await buildRagStream(env, '지금 미세먼지 얼마야', [], 'ok');
    const events = await collectEvents(stream);
    // Assert
    expect(events.at(-1)).toMatchObject({ type: 'done', intent: 'data_lookup' });
  });

  it('includes the causal_reasoning system-prompt section only for a causal-intent question', async () => {
    // Arrange
    const run = makeAiRun(['because...']);
    const env = makeEnv({ AI: { run } as unknown as Ai });
    // Act
    await buildRagStream(env, 'why is pm2.5 high today', [], 'ok');
    // Assert — the chat call (input.messages set) carries the system message.
    const chatCall = run.mock.calls.find((call) => (call[1] as { messages?: unknown }).messages !== undefined);
    const systemMsg = (chatCall![1] as { messages: Array<{ role: string; content: string }> }).messages[0];
    expect(systemMsg.content).toContain('<causal_reasoning>');
  });

  it('omits the causal_reasoning section for a general-intent question', async () => {
    // Arrange
    const run = makeAiRun(['hi there']);
    const env = makeEnv({ AI: { run } as unknown as Ai });
    // Act
    await buildRagStream(env, 'hello', [], 'ok');
    // Assert
    const chatCall = run.mock.calls.find((call) => (call[1] as { messages?: unknown }).messages !== undefined);
    const systemMsg = (chatCall![1] as { messages: Array<{ role: string; content: string }> }).messages[0];
    expect(systemMsg.content).not.toContain('<causal_reasoning>');
  });

  it('passes reasoning_effort to env.AI.run, defaulting to "low" for an invalid/missing var — CHAT_MODEL is a reasoning model whose thinking tokens draw from the same max_tokens budget as the answer (A-5 incident)', async () => {
    // Arrange
    const run = makeAiRun(['ok']);
    const env = makeEnv({ AI: { run } as unknown as Ai, REASONING_EFFORT: 'not-a-real-value' });
    // Act
    await buildRagStream(env, 'hi', [], 'ok');
    // Assert
    const chatCall = run.mock.calls.find((call) => (call[1] as { messages?: unknown }).messages !== undefined);
    expect((chatCall![1] as { reasoning_effort?: string }).reasoning_effort).toBe('low');
  });

  it('never silently drops an answer — citations-only with zero token events emits a visible failure notice instead of a blank bubble (A-5 incident: prod returned HTTP 200, no exception, zero token events, empty answer bubble next to real citations)', async () => {
    // Arrange — reasoning consumed the entire token budget: the upstream
    // request succeeds (no thrown error) but yields no content frames at
    // all, exactly like nativeSseStream([]) below (immediate [DONE], no
    // response frames) — indistinguishable to this code from what actually
    // happened in production.
    const run = makeAiRun([]);
    const query = vi.fn().mockResolvedValue({
      count: 1,
      matches: [{ id: 'faq:dqss', score: 0.7, metadata: SAMPLE_METADATA }],
    });
    const env = makeEnv({ AI: { run } as unknown as Ai, VECTORIZE: { query } as unknown as VectorizeIndex });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Act
    const stream = await buildRagStream(env, 'DQSS 점수가 뭔가요?', [], 'ok');
    const events = (await collectEvents(stream)) as Array<{ type: string; content?: string; citations?: unknown[] }>;
    // Assert — citations still render (retrieval genuinely found something)...
    expect(events[0].type).toBe('citations');
    // ...but the user is shown an honest notice instead of silence, and it
    // is NOT the blank string a naive fix (e.g. a raw empty token event)
    // would produce.
    const tokenEvents = events.filter((e) => e.type === 'token');
    expect(tokenEvents).toHaveLength(1);
    expect(tokenEvents[0].content).toContain('could not produce an answer');
    expect(tokenEvents[0].content).toContain('답변을 생성하지 못했습니다');
    expect(events.at(-1)).toEqual({ type: 'done', budget: 'ok', intent: 'general' });
    // ...and it's logged, not silently swallowed (this is what a naive fix
    // that only added the user-facing notice, without also fixing the
    // silent-failure observability gap, would still get wrong).
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('folds a fetched live-data block into <structured_context> in the system prompt for a data_lookup intent', async () => {
    // Arrange
    clearSnapshotMemo();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        generated_at: new Date().toISOString(),
        predictions: [{ name: 'Seoul', lat: 37.5, lon: 127, predicted_p10: 18, predicted_p50: 25, predicted_p90: 32 }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const run = makeAiRun(['ok']);
    const env = makeEnv({ AI: { run } as unknown as Ai, HF_LIVE_BASE: 'https://example.invalid/live' });
    // Act
    await buildRagStream(env, '지금 seoul 미세먼지 얼마야', [], 'ok');
    // Assert
    const chatCall = run.mock.calls.find((call) => (call[1] as { messages?: unknown }).messages !== undefined);
    const systemMsg = (chatCall![1] as { messages: Array<{ role: string; content: string }> }).messages[0];
    expect(systemMsg.content).toContain('<structured_context>');
    expect(systemMsg.content).toContain('Seoul');
  });
});

describe('buildDegradedStream', () => {
  it('never calls the chat model — only the (cheap) query embedding', async () => {
    // Arrange
    const run = makeAiRun(['should not be reached']);
    const env = makeEnv({ AI: { run } as unknown as Ai });
    // Act
    const stream = await buildDegradedStream(env, 'why is pm2.5 high');
    await collectEvents(stream);
    // Assert — every call must have been an embedding call (input.text set),
    // never a chat call (input.messages set).
    for (const call of run.mock.calls) {
      const input = call[1] as { text?: unknown; messages?: unknown };
      expect(input.text).toBeDefined();
      expect(input.messages).toBeUndefined();
    }
  });

  it('lists retrieved sources verbatim in a single token frame, budget: exhausted, with a citations event', async () => {
    // Arrange
    const run = makeAiRun([]);
    const query = vi.fn().mockResolvedValue({
      count: 1,
      matches: [{ id: 'faq:aqi-scale', score: 0.8, metadata: SAMPLE_METADATA }],
    });
    const env = makeEnv({ AI: { run } as unknown as Ai, VECTORIZE: { query } as unknown as VectorizeIndex });
    // Act
    const stream = await buildDegradedStream(env, 'aqi scale?');
    const events = await collectEvents(stream) as Array<{ type: string; content?: string; citations?: unknown[] }>;
    // Assert
    expect(events[0].type).toBe('citations');
    const tokenEvent = events.find((e) => e.type === 'token');
    expect(tokenEvent?.content).toContain('AQI scale');
    expect(events.at(-1)).toEqual({ type: 'done', budget: 'exhausted', intent: 'general' });
  });

  it('says plainly that nothing was found when retrieval has no matches (never fabricates a source)', async () => {
    // Arrange
    const run = makeAiRun([]);
    const env = makeEnv({ AI: { run } as unknown as Ai }); // no VECTORIZE
    // Act
    const stream = await buildDegradedStream(env, 'obscure question');
    const events = await collectEvents(stream) as Array<{ type: string; content?: string }>;
    // Assert
    expect(events.some((e) => e.type === 'citations')).toBe(false);
    const tokenEvent = events.find((e) => e.type === 'token');
    expect(tokenEvent?.content).toContain('No matching documentation was found');
  });

  it('never leaks model-facing instruction phrasing into the degraded-path token event when the honesty gate fires (att: null) — B1 regression', async () => {
    // Arrange — a policy-intent question on a country page, with the fetched
    // policy snapshot honesty-gated (att: null). The degraded path must
    // render this through the user-facing (plain-text) summary, not the
    // system-prompt-facing formatPolicyImpact block, which carries sentences
    // like "Do NOT fabricate..." that read as bizarre/leaked instructions if
    // ever shown to an end user verbatim.
    clearSnapshotMemo();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('predictions')) {
        return { ok: true, json: async () => ({ generated_at: new Date().toISOString(), predictions: [] }) };
      }
      return {
        ok: true,
        json: async () => ({
          country: 'KR',
          method: 'sdid',
          att: null,
          ci_95: null,
          p_value: null,
          significant: null,
          status: 'insufficient_controls',
          treatment_year: null,
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    const run = makeAiRun(['should not be reached']);
    const env = makeEnv({ AI: { run } as unknown as Ai, HF_LIVE_BASE: 'https://example.invalid/live' });
    // Act
    const stream = await buildDegradedStream(env, 'why did the clean air policy fail', '/country/KR');
    const events = (await collectEvents(stream)) as Array<{ type: string; content?: string }>;
    // Assert
    const tokenEvent = events.find((e) => e.type === 'token');
    const body = tokenEvent?.content ?? '';
    expect(body).not.toContain('do not invent one');
    expect(body).not.toContain('Do NOT fabricate');
    expect(body).not.toContain('never as a proven fact');
    expect(body).not.toContain('do not state one');
    // Still degrades gracefully — the underlying fact (no policy-impact
    // estimate for this honesty-gated country) is conveyed honestly in
    // plain words, not silently dropped.
    const conveysHonestly = /insufficient_controls/i.test(body) || /no .*(policy|estimate).*available/i.test(body);
    expect(conveysHonestly).toBe(true);
  });

  it('includes a live-data block verbatim for a data_lookup intent, still with zero chat-model calls', async () => {
    // Arrange — live-data lookup is a plain HTTP fetch (zero neurons), so
    // including it here doesn't touch the budget the degraded path protects.
    clearSnapshotMemo();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        generated_at: new Date().toISOString(),
        predictions: [{ name: 'Seoul', lat: 37.5, lon: 127, predicted_p10: 18, predicted_p50: 25, predicted_p90: 32 }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const run = makeAiRun(['should not be reached']);
    const env = makeEnv({ AI: { run } as unknown as Ai, HF_LIVE_BASE: 'https://example.invalid/live' });
    // Act
    const stream = await buildDegradedStream(env, '지금 seoul 미세먼지 얼마야');
    const events = await collectEvents(stream) as Array<{ type: string; content?: string }>;
    // Assert
    const tokenEvent = events.find((e) => e.type === 'token');
    expect(tokenEvent?.content).toContain('Seoul');
    expect(events.at(-1)).toMatchObject({ type: 'done', budget: 'exhausted', intent: 'data_lookup' });
    for (const call of run.mock.calls) {
      expect((call[1] as { messages?: unknown }).messages).toBeUndefined();
    }
  });
});
