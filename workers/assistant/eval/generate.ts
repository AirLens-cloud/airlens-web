// eval/generate.ts — the missing half of the quality eval.
//
// Ported from the retired chatbot worker's eval/generate.ts (design §1 D-1).
// Every eval in this directory used to score text we wrote by hand:
// quality.eval.test.ts fed the judge a GOOD_ANSWER constant, so
// `quality_grounding = 1.0` meant "the judge likes our reference paragraph",
// not "our model is grounded". No eval called CHAT_MODEL, so swapping the
// model could not move a single number — the suite was blind to exactly the
// thing a model A/B has to see.
//
// This module runs a candidate model over the SAME messages the worker
// builds (prompts.buildMessages, gated by guardrails.classifyIntent exactly
// as chat-stream.ts buildRagStream does) through the Workers AI REST
// endpoint — the same surface eval/generate.ts always used, kept portable to
// CI (.github/workflows) rather than requiring a local wrangler session.
//
// OPT-IN: missing env SKIPS loudly. It must never fake a pass.
// `?raw` (Vite/vitest) instead of node:fs — this package has no @types/node,
// and pulling one in just to read four settings is not worth a dependency.
import wranglerToml from '../wrangler.toml?raw';
import { buildMessages } from '../src/prompts';
import { buildGroundedContext } from '../src/rag';
import { classifyIntent } from '../src/guardrails';
import type { RetrievedMatch } from '../src/rag';

declare const process: { env: Record<string, string | undefined> };

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const AI_TOKEN = process.env.CLOUDFLARE_WORKERS_AI_TOKEN;

export const GENERATOR_ENABLED = Boolean(ACCOUNT_ID && AI_TOKEN);

export interface WranglerVars {
  chatModel: string;
  maxTokens: number;
  temperature: number;
  maxHistoryTurns: number;
}

/**
 * Read generation settings from wrangler.toml [vars].
 *
 * Not a config duplicate on purpose: an A/B run with a different token budget
 * or temperature than production measures a system we do not ship. MAX_TOKENS
 * in particular is load-bearing — CHAT_MODEL is a thinking model whose reasoning
 * eats the budget before any user-visible content is produced (probed directly
 * against this account: CHAT_MODEL returned an empty `content` with
 * `finish_reason: "length"` at a 20-token cap — see prompts.ts's own
 * DEFAULT_MAX_HISTORY_TURNS comment for the analogous NaN-guard rationale).
 */
export function parseWranglerVars(toml: string): WranglerVars {
  const read = (key: string): string => {
    const m = toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'));
    if (!m) throw new Error(`wrangler.toml is missing ${key}`);
    return m[1];
  };
  const num = (key: string): number => {
    const value = Number(read(key));
    if (!Number.isFinite(value)) throw new Error(`wrangler.toml ${key} is not numeric`);
    return value;
  };
  return {
    chatModel: read('CHAT_MODEL'),
    maxTokens: num('MAX_TOKENS'),
    temperature: num('TEMPERATURE'),
    maxHistoryTurns: num('MAX_HISTORY_TURNS'),
  };
}

let cachedVars: WranglerVars | null = null;

export function wranglerVars(): WranglerVars {
  if (!cachedVars) cachedVars = parseWranglerVars(wranglerToml);
  return cachedVars;
}

/**
 * Wraps pre-rendered structured-evidence blocks in the same
 * `<structured_context>` boundary tag liveData.ts's buildStructuredContext
 * uses for a live-fetched LiveDataContext. Duplicated rather than imported
 * because eval/cases.ts hands this module already-formatted strings (the
 * formatter output itself, for cases that don't correspond to a real HF
 * snapshot fetch) rather than a LiveDataContext object — if the wrapper text
 * in liveData.ts ever changes, update this to match (both are five lines).
 * Exported for eval/trajectory.eval.test.ts, which assembles the same
 * pipeline chat-stream.ts's buildRagStream does and needs the identical wrap.
 */
export function wrapStructuredContext(blocks: string[]): string {
  if (blocks.length === 0) return '';
  return `<structured_context>
The following structured AirLens data was looked up for this question.
Values marked ESTIMATED/prediction are model outputs, not measurements —
never state them with the same certainty as a MEASURED value.

${blocks.join('\n\n')}
</structured_context>`;
}

/** One evaluation case's inputs — everything except which model answers it. */
export interface EvidenceRequest {
  question: string;
  structuredBlocks?: string[];
  matches?: RetrievedMatch[];
}

export interface GenerateRequest extends EvidenceRequest {
  model: string;
}

export interface GenerateResult {
  model: string;
  /** Evidence exactly as the model saw it — handed to the judge unchanged. */
  evidence: string;
  text: string;
  /** Cloudflare's stop reason when it reports one ('length' = truncated). */
  finishReason: string | null;
}

/**
 * Build the system+user messages the deployed worker would send for this
 * case — mirrors chat-stream.ts buildRagStream exactly: intent classified
 * from the question (zero LLM calls), causal_reasoning included only for
 * causal/policy intents, grounded context = corpus matches + structured
 * evidence joined the same way buildRagStream joins them.
 */
export function buildEvalMessages(
  req: EvidenceRequest,
): Array<{ role: string; content: string }> {
  const { maxHistoryTurns } = wranglerVars();
  const intent = classifyIntent(req.question);
  const includeCausalReasoning = intent === 'causal' || intent === 'policy';
  const groundedContext = [buildGroundedContext(req.matches ?? []), wrapStructuredContext(req.structuredBlocks ?? [])]
    .filter(Boolean)
    .join('\n\n');
  return buildMessages(req.question, [], maxHistoryTurns, groundedContext, includeCausalReasoning);
}

interface WorkersAiEnvelope {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: {
    response?: unknown;
    finish_reason?: unknown;
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
  };
}

/**
 * Pull the answer out of a Workers AI envelope.
 *
 * An UNKNOWN shape throws; an EMPTY answer returns ''. The distinction matters:
 * a model that burns its whole budget on reasoning and emits zero characters is
 * a real, measurable production failure (it reaches users as a blank bubble),
 * while a response we cannot parse is a broken measurement that must not be
 * scored as if the model had said nothing.
 */
export function extractAnswer(json: unknown): { text: string; finishReason: string | null } {
  const env = json as WorkersAiEnvelope;
  if (env?.success === false) {
    const msg = (env.errors ?? []).map((e) => e?.message).filter(Boolean).join('; ');
    throw new Error(`Workers AI error: ${msg || 'unspecified failure'}`);
  }
  const result = env?.result;
  if (!result || typeof result !== 'object') {
    throw new Error(`Workers AI response shape mismatch: no result object`);
  }
  const choice = result.choices?.[0];
  const raw = typeof result.response === 'string' ? result.response : choice?.message?.content;
  if (typeof raw !== 'string') {
    throw new Error(
      'Workers AI response shape mismatch: neither result.response nor result.choices[0].message.content is a string',
    );
  }
  const finish = result.finish_reason ?? choice?.finish_reason;
  return { text: raw.trim(), finishReason: typeof finish === 'string' ? finish : null };
}

// Transient on Cloudflare's side, not a statement about the model. Retry
// these; fail fast on everything else (401/404 = wrong token or wrong model
// id, which retrying cannot fix) — ported from the retired chatbot worker's
// eval/generate.ts, where the first 3-way A/B run (2026-07-30) died on a
// single `HTTP 408 AiError: Request timeout` and threw away four
// already-paid-for measurements with it.
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export const GENERATE_ATTEMPTS = 3;

/** Linear backoff — Workers AI queues, it does not need exponential politeness. */
export function retryDelayMs(attempt: number): number {
  return 2_000 * attempt;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function generateAnswer(
  req: GenerateRequest,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<GenerateResult> {
  if (fetchImpl === fetch && !GENERATOR_ENABLED) {
    throw new Error('generator env not set (CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_WORKERS_AI_TOKEN)');
  }
  const { maxTokens, temperature } = wranglerVars();
  const messages = buildEvalMessages(req);

  let res!: Response;
  for (let attempt = 1; attempt <= GENERATE_ATTEMPTS; attempt++) {
    res = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${req.model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AI_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages, max_tokens: maxTokens, temperature }),
      },
    );
    if (res.ok || !RETRYABLE_STATUSES.has(res.status) || attempt === GENERATE_ATTEMPTS) break;
    console.log(
      `[generate] ${req.model} HTTP ${res.status} — retry ${attempt}/${GENERATE_ATTEMPTS - 1}`,
    );
    await sleep(retryDelayMs(attempt));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const retried = RETRYABLE_STATUSES.has(res.status) ? ` after ${GENERATE_ATTEMPTS} attempts` : '';
    throw new Error(
      `Workers AI HTTP ${res.status} for ${req.model}${retried}: ${body.slice(0, 300)}`,
    );
  }
  const { text, finishReason } = extractAnswer(await res.json());
  return {
    model: req.model,
    evidence: messages[0].content,
    text,
    finishReason,
  };
}
