/**
 * Runtime bindings + wire shapes for the Field Assistant worker (C1 scaffold).
 *
 * No Supabase, no auth JWT — this worker is keyless/anonymous by design
 * (Field Assistant v2 design §1 D-2). `SESSION_HMAC_SECRET` and
 * `TURNSTILE_SECRET` are Workers secrets (`wrangler secret put`), never
 * declared in wrangler.toml — see the comment block at the bottom of that
 * file for what each one does and its dev-bypass behavior.
 */

export interface Env {
  /** Rate-limit / daily-quota / global-budget counter store. Optional — all
   *  three guards fail OPEN when this binding is absent (dev/test, or before
   *  an operator provisions the KV namespace). */
  CHAT_QUOTA?: KVNamespace;

  SESSION_HMAC_SECRET?: string;
  TURNSTILE_SECRET?: string;

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

/** SSE payload shapes streamed from POST /api/chat — design §2. C1 (echo-only,
 *  no RAG) never emits a `citations` event: emitting one with an empty array
 *  would look like "we searched and found nothing" rather than "we didn't
 *  search" (Glass-box — never imply work that didn't happen). */
export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'citations'; citations: ChatCitationWire[] }
  | { type: 'done'; budget: ChatBudgetStatus; intent: ChatIntent };

export interface ChatCitationWire {
  source_title: string;
  source_url: string | null;
  relevance: number | null;
  excerpt?: string;
}

export type ChatErrorCode = 'turnstile_failed' | 'rate_limited' | 'quota_exceeded' | 'origin_denied' | 'invalid_body';

export interface ChatErrorBody {
  error: string;
  code?: ChatErrorCode;
  retry_after?: number;
}
