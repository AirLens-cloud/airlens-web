/**
 * Field Assistant client — session issuance + SSE chat streaming against
 * `workers/assistant/` (deployed with C3+C4's RAG/intent code, A-4).
 * ASSISTANT_API_BASE empty means every export here is a no-op that yields
 * nothing; `ChatPanel` never calls in unless the base is configured.
 *
 * Session issuance requires a Turnstile token once the worker's
 * `TURNSTILE_SECRET` is set (production) — see `../lib/turnstile.ts` for how
 * that token is obtained.
 *
 * Uses `fetch` + a manual `ReadableStream` reader rather than `EventSource`
 * because the request is a POST with a JSON body — `EventSource` only does
 * GET.
 */
import { ASSISTANT_API_BASE } from '../lib/config/dataSources'
import { getTurnstileToken, resetTurnstileToken } from '../lib/turnstile'
import type { ChatMessage, ChatRequest, ChatSessionRequest, ChatSessionResponse, ChatStreamEvent } from '../types/chat'

const SESSION_FETCH_TIMEOUT_MS = 8000
/** Mirrors the worker's own ceiling: MAX_HISTORY_TURNS (10) * 2. The worker
 *  400s a longer array (workers/assistant/src/index.ts handleChat) and its
 *  prompt builder trims to the same number, so sending more is rejected
 *  payload, not extra context. Kept in sync by hand — both sides state the
 *  derivation, and assistant.test.ts pins this side. */
const MAX_MESSAGES_PER_REQUEST = 20
// Refresh a little before the token's real expiry so a chat request never
// races an about-to-expire session.
const SESSION_REFRESH_SLACK_MS = 30_000

let cachedSession: { token: string; expiresAt: number } | null = null

async function ensureSession(): Promise<string | null> {
  if (!ASSISTANT_API_BASE) return null
  if (cachedSession && cachedSession.expiresAt - SESSION_REFRESH_SLACK_MS > Date.now()) {
    return cachedSession.token
  }
  // Declared outside the try so the finally block below can still see it —
  // a token is spent (and must be reset) whether fetch() resolves, rejects,
  // or throws outright (a network error, or AbortSignal firing on timeout).
  // A prior version only reset on the resolved-response path, which left
  // resetTurnstileToken() unreachable exactly when a caller most needs the
  // widget to recover: a network hiccup (code review, PR #50).
  let turnstileToken: string | null = null
  try {
    // A null token (widget never mounted, script blocked) is not treated as
    // a local error — the worker decides what a missing token means:
    // turnstile_failed in production, a dev-bypass pass with
    // TURNSTILE_SECRET unset. Either way the request still goes out.
    turnstileToken = await getTurnstileToken()
    const requestBody: ChatSessionRequest = turnstileToken ? { turnstileToken } : {}
    const res = await fetch(`${ASSISTANT_API_BASE}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(SESSION_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json()) as ChatSessionResponse
    if (typeof body.session !== 'string' || typeof body.expiresAt !== 'number') return null
    cachedSession = { token: body.session, expiresAt: body.expiresAt }
    return body.session
  } catch {
    return null
  } finally {
    // Tokens are single-use — spent whether the worker accepted it,
    // rejected it, or the request never completed at all.
    if (turnstileToken) resetTurnstileToken()
  }
}

/**
 * Streams a reply for `messages` (the conversation so far, last entry must be
 * the new user turn). Yields each SSE event as it arrives; the caller
 * assembles the assistant message from `token` events and stops on `done`.
 * A missing worker, a failed session exchange, or a non-OK response all
 * yield a single `done` event with `budget: 'exhausted'` rather than
 * throwing — `ChatPanel` renders that the same way it renders a real
 * exhausted-budget response from the worker.
 */
export async function* streamAssistantReply(
  messages: ChatMessage[],
  locale: 'en' | 'ko',
  page: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  if (!ASSISTANT_API_BASE) return

  const session = await ensureSession()
  if (!session) {
    yield { type: 'done', budget: 'exhausted', intent: 'general' }
    return
  }

  const payload: ChatRequest = {
    session,
    // Trimmed to the same ceiling the worker enforces (MAX_HISTORY_TURNS*2 =
    // 20; it 400s anything longer) — and the worker's prompt builder trims to
    // that number anyway, so the dropped entries were never going to reach
    // the model. Without this, a conversation past ~10 turns would start
    // failing outright, since ChatPanel accumulates the full history.
    messages: messages.slice(-MAX_MESSAGES_PER_REQUEST).map((m) => ({ role: m.role, content: m.content })),
    locale,
    page,
  }

  let res: Response
  try {
    res = await fetch(`${ASSISTANT_API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch {
    yield { type: 'done', budget: 'exhausted', intent: 'general' }
    return
  }

  if (!res.ok || !res.body) {
    yield { type: 'done', budget: 'exhausted', intent: 'general' }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const event = parseSseFrame(frame)
        if (event) yield event
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseSseFrame(frame: string): ChatStreamEvent | null {
  const line = frame.trim()
  if (!line.startsWith('data:')) return null
  const jsonStr = line.slice(5).trim()
  try {
    return JSON.parse(jsonStr) as ChatStreamEvent
  } catch {
    // A malformed frame must not crash the stream — drop it.
    return null
  }
}
