/**
 * Chat types — ported from AirLens-platform apps/web/src/types/chat.ts (trimmed
 * to what ChatMessageBubble/CitationCard actually render; the source's
 * request/response wire types are dropped since this port has no backend yet,
 * Wave 4 Block 3).
 */

export interface ChatCitation {
  source_title: string
  source_url: string | null
  /** Retrieval relevance (0-1), not a confidence score. `null` when the worker didn't compute one. */
  relevance: number | null
  excerpt?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  citations?: ChatCitation[]
}

// ── Field Assistant v2 API wire types (C1 scaffold: workers/assistant/) ────
// See Obsidian-airlens/wiki/synthesis/field-assistant-v2-design-2026-09-02.md §2.
// C1 is SSE echo only — no RAG, no LLM — so `citations` is typed for the
// contract's sake but the C1 worker never emits it (Glass-box: never imply a
// search happened when it didn't). `intent` is always `'general'` until the
// guardrails.ts port lands in C3.

/** POST {WORKER}/api/session body. */
export interface ChatSessionRequest {
  turnstileToken?: string
}

export interface ChatSessionResponse {
  session: string
  /** epoch ms */
  expiresAt: number
  devBypass?: boolean
}

/** POST {WORKER}/api/chat body (SSE response). */
export interface ChatRequest {
  session: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  locale?: 'en' | 'ko'
  page?: string
}

export type ChatIntent = 'causal' | 'policy' | 'data_lookup' | 'general'
export type ChatBudgetStatus = 'ok' | 'exhausted'

export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'citations'; citations: ChatCitation[] }
  // finish_reason mirrors the Workers AI upstream signal ('stop' = complete
  // answer, 'length' = MAX_TOKENS exhausted mid-answer — the A-5 truncation
  // shape). Optional: the client-synthesized `done` events for the
  // exhausted-budget/error paths in api/assistant.ts never call the model,
  // so they omit it rather than fabricate a value.
  | { type: 'done'; budget: ChatBudgetStatus; intent: ChatIntent; finish_reason?: string | null }

// `quota_unavailable` (503) is not a limit the caller hit — it means the
// worker could not read its quota counters and refused rather than serve
// uncapped (workers/assistant/src/quota.ts).
export type ChatErrorCode = 'turnstile_failed' | 'rate_limited' | 'quota_exceeded' | 'quota_unavailable' | 'origin_denied' | 'invalid_body'

export interface ChatErrorBody {
  error: string
  code?: ChatErrorCode
  retry_after?: number
}
