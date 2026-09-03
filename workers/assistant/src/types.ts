/**
 * Runtime bindings + wire shapes for the Field Assistant worker.
 *
 * No Supabase, no auth JWT — this worker is keyless/anonymous by design
 * (Field Assistant v2 design §1 D-2). `SESSION_HMAC_SECRET`, `TURNSTILE_SECRET`
 * and `ADMIN_REINDEX_SECRET` are Workers secrets (`wrangler secret put`),
 * never declared in wrangler.toml — see the comment block at the bottom of
 * that file for what each one does and its dev-bypass behavior.
 */

export interface Env {
  /** Rate-limit / daily-quota / global-budget counter store. Optional — all
   *  three guards fail OPEN when this binding is absent (dev/test, or before
   *  an operator provisions the KV namespace). */
  CHAT_QUOTA?: KVNamespace;

  /** Workers AI binding — bge-m3 embeddings (RAG query + reindex) and the
   *  gemma chat model (design §1 D-4). Always remote, even in `wrangler dev`. */
  AI: Ai;

  /** Corpus vector store (design §1 D-3) — content/*.ts chunks, indexed via
   *  POST /api/admin/reindex. Optional so the worker still boots (RAG
   *  degrades to "no evidence found" rather than crashing) before an
   *  operator has run `wrangler vectorize create`. */
  VECTORIZE?: VectorizeIndex;

  SESSION_HMAC_SECRET?: string;
  TURNSTILE_SECRET?: string;
  /** Shared secret for POST /api/admin/reindex. Absent = endpoint refuses
   *  every request (fail CLOSED — unlike the user-facing guards, an
   *  unauthenticated reindex is a corpus-poisoning vector, not an
   *  availability tradeoff). */
  ADMIN_REINDEX_SECRET?: string;

  SESSION_TTL_SECONDS: string;
  RATE_LIMIT_PER_MINUTE: string;
  DAILY_MESSAGE_LIMIT: string;
  DAILY_REQUEST_BUDGET: string;
  REQUEST_COST_ESTIMATE: string;
  MAX_MESSAGE_LENGTH: string;
  MAX_HISTORY_TURNS: string;
  /** Comma-separated CORS allowlist. No "*" — this worker issues session
   *  tokens and accepts chat input, unlike the keyless public-api worker. */
  ALLOWED_ORIGINS: string;

  /** Workers AI catalog ids — see wrangler.toml for the "why this model"
   *  rationale (design §1 D-4). Vars, not hardcoded, so a model swap after
   *  the model-ab eval (C4) is a config change, not a code change. */
  CHAT_MODEL: string;
  EMBEDDING_MODEL: string;
  MAX_TOKENS: string;
  TEMPERATURE: string;
  /** 'low' | 'medium' | 'high' — CHAT_MODEL is a reasoning-capable model
   *  whose thinking tokens draw from the SAME MAX_TOKENS budget as the
   *  visible answer (Workers AI catalog: gemma-4-26b-a4b-it accepts
   *  `reasoning_effort` as a distinct param from `max_tokens`/
   *  `max_completion_tokens`). Left unset in production, some questions
   *  spent the entire 512-token budget on reasoning and streamed zero
   *  `token` events — citations only, an empty answer bubble, no error
   *  anywhere (A-5 incident, chat-stream.ts buildRagStream). 'low' leaves
   *  more of the fixed budget for the actual answer. */
  REASONING_EFFORT: string;
  /** Vectorize topK per query (design §1 D-3, ported RAG_TOP_K=5 default). */
  RAG_TOP_K: string;

  /** Base URL for the public HF live-data dataset this repo reads as its data
   *  primary (`src/lib/config/dataSources.ts` HF_LIVE_BASE — same repo, same
   *  publish pipeline). C3 live-data tool calls (liveData.ts) fetch
   *  `${HF_LIVE_BASE}/ml-data/predictions/grid_latest.json` (city PM2.5
   *  predictions) and `${HF_LIVE_BASE}/insights-data/policy-impact/{cc}.json`
   *  (SDID policy impact) from here — a worker-side var rather than
   *  `import.meta.env` (Vite-only, unavailable to a plain Workers deploy). */
  HF_LIVE_BASE: string;
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessageWire {
  role: ChatRole;
  content: string;
}

/** POST /api/chat body — Field Assistant v2 design §2. */
export interface ChatRequestBody {
  session: string;
  messages: ChatMessageWire[];
  locale?: 'en' | 'ko';
  page?: string;
}

/** POST /api/session body — turnstileToken is absent/ignored in dev-bypass. */
export interface SessionRequestBody {
  turnstileToken?: string;
}

export type ChatIntent = 'causal' | 'policy' | 'data_lookup' | 'general';
export type ChatBudgetStatus = 'ok' | 'exhausted';

/** guardrails.ts checkGuardrails result — ported from the retired chatbot
 *  worker's types.ts. `reason`/`fallback_message` are non-null together
 *  (`passed: false`) or both null (`passed: true`). */
export interface GuardrailResult {
  passed: boolean;
  reason: 'injection' | 'system_probe' | 'out_of_scope' | null;
  fallback_message: string | null;
}

/** SSE payload shapes streamed from POST /api/chat — design §2. A `citations`
 *  event is emitted only when Vectorize actually returned matches — an empty
 *  array would look like "we searched and found nothing" rather than "we
 *  didn't search" (Glass-box — never imply work that didn't happen). C1's
 *  echo path never emitted one; the C2 RAG path emits it, when non-empty,
 *  before the first `token` event (retrieval already completed by the time
 *  generation starts — see chat-stream.ts buildRagStream). */
export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'citations'; citations: ChatCitationWire[] }
  | { type: 'done'; budget: ChatBudgetStatus; intent: ChatIntent; finish_reason: string | null };

export interface ChatCitationWire {
  source_title: string;
  source_url: string | null;
  relevance: number | null;
  excerpt?: string;
}

export type ChatErrorCode =
  | 'turnstile_failed'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'origin_denied'
  | 'invalid_body'
  /** guardrails.ts checkGuardrails rejected the message (injection attempt,
   *  system-probe, or out-of-scope topic) — see GuardrailResult.reason for
   *  which. */
  | 'blocked';

export interface ChatErrorBody {
  error: string;
  code?: ChatErrorCode;
  retry_after?: number;
}

// ── Corpus reindexing (POST /api/admin/reindex) ─────────────────────────────
// One chunk = one embeddable unit from content/*.ts (build-corpus.mjs is the
// only producer — see that script's header for the chunking rules per
// content module). `category` is metadata only (not yet used for filtered
// retrieval) — kept so a future query can scope to e.g. "glossary" only.

export type CorpusChunkCategory = 'methodology' | 'faq' | 'glossary' | 'about' | 'legal' | 'static';

export interface CorpusChunk {
  /** Stable id, e.g. "glossary:pm25" — becomes the Vectorize vector id, so
   *  re-running reindex with the same id set overwrites in place rather than
   *  accumulating duplicates. */
  id: string;
  /** Text actually embedded. */
  text: string;
  source_title: string;
  /** In-repo route this chunk documents (e.g. "/glossary#pm25"). Every
   *  content/*.ts source in this corpus has a real route — never empty. */
  source_url: string;
  category: CorpusChunkCategory;
}

export interface ReindexRequestBody {
  chunks: CorpusChunk[];
}

export interface ReindexResponseBody {
  indexed: number;
  batches: number;
}

/** Vectorize vector metadata — the subset of CorpusChunk carried alongside
 *  each embedding, read back on query to build ChatCitationWire without a
 *  second lookup. Vectorize metadata values must be string/number/boolean
 *  (no null, no nested objects) — source_url is always a real route (see
 *  CorpusChunk), so no null-sentinel is needed here. */
export interface CorpusVectorMetadata {
  source_title: string;
  source_url: string;
  category: CorpusChunkCategory;
  /** First N chars of `text`, shown in the citation card. */
  excerpt: string;
  [key: string]: string | number | boolean;
}
