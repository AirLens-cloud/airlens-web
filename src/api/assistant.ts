/**
 * Field Assistant client — session issuance + SSE chat streaming against
 * `workers/assistant/` (C1 scaffold — echo only, no RAG). ASSISTANT_API_BASE
 * empty (worker not deployed) means every export here is a no-op that
 * yields nothing; `ChatPanel` never calls in unless the base is configured.
 *
 * Uses `fetch` + a manual `ReadableStream` reader rather than `EventSource`
 * because the request is a POST with a JSON body — `EventSource` only does
 * GET.
 */
import { ASSISTANT_API_BASE } from '../lib/config/dataSources'
import type { ChatMessage, ChatRequest, ChatSessionResponse, ChatStreamEvent } from '../types/chat'

const SESSION_FETCH_TIMEOUT_MS = 8000
// Refresh a little before the token's real expiry so a chat request never
// races an about-to-expire session.
const SESSION_REFRESH_SLACK_MS = 30_000

let cachedSession: { token: string; expiresAt: number } | null = null

async function ensureSession(): Promise<string | null> {
  if (!ASSISTANT_API_BASE) return null
  if (cachedSession && cachedSession.expiresAt - SESSION_REFRESH_SLACK_MS > Date.now()) {
    return cachedSession.token
  }
  try {
    const res = await fetch(`${ASSISTANT_API_BASE}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(SESSION_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json()) as ChatSessionResponse
    if (typeof body.session !== 'string' || typeof body.expiresAt !== 'number') return null
    cachedSession = { token: body.session, expiresAt: body.expiresAt }
    return body.session
  } catch {
    return null
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
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
