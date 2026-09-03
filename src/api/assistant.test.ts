// AAA coverage for the Field Assistant client:
// - not-configured (no ASSISTANT_API_BASE) yields nothing at all
// - a failed/expired session exchange degrades to a single exhausted `done`
// - a successful session + SSE stream is parsed into the right event sequence
// - SSE frames split across chunk boundaries are still parsed correctly
// - A-4: the Turnstile token is threaded into the /api/session request body
//   and the widget is reset once the token is spent
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const dataSources = vi.hoisted(() => ({ ASSISTANT_API_BASE: '' }))
vi.mock('../lib/config/dataSources', () => dataSources)

const turnstile = vi.hoisted(() => ({
  getTurnstileToken: vi.fn(async (): Promise<string | null> => null),
  resetTurnstileToken: vi.fn(),
}))
vi.mock('../lib/turnstile', () => turnstile)

import { streamAssistantReply } from './assistant'
import type { ChatMessage, ChatStreamEvent } from '../types/chat'

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response
}

/** A fake streaming Response whose body yields `chunks` (already-encoded SSE text) in order. */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  let i = 0
  const reader = {
    read: async () => {
      if (i < chunks.length) {
        const value = encoder.encode(chunks[i])
        i += 1
        return { done: false, value }
      }
      return { done: true, value: undefined }
    },
    releaseLock: () => {},
  }
  return { ok: true, body: { getReader: () => reader } } as unknown as Response
}

async function collect(gen: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const out: ChatStreamEvent[] = []
  for await (const event of gen) out.push(event)
  return out
}

const MESSAGES: ChatMessage[] = [{ role: 'user', content: 'hello', timestamp: 1 }]

beforeEach(() => {
  vi.unstubAllGlobals()
  dataSources.ASSISTANT_API_BASE = ''
  turnstile.getTurnstileToken.mockReset().mockResolvedValue(null)
  turnstile.resetTurnstileToken.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('streamAssistantReply — not configured', () => {
  it('yields nothing and never calls fetch when ASSISTANT_API_BASE is empty', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)

    const events = await collect(streamAssistantReply(MESSAGES, 'en', '/today'))

    expect(events).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('streamAssistantReply — session exchange failure', () => {
  beforeEach(() => {
    dataSources.ASSISTANT_API_BASE = 'https://assistant.example'
  })

  it('degrades to a single exhausted `done` when the session request is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(null, false)))

    const events = await collect(streamAssistantReply(MESSAGES, 'en', '/today'))

    expect(events).toEqual([{ type: 'done', budget: 'exhausted', intent: 'general' }]);
  })

  it('degrades to a single exhausted `done` when the session response has no session field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ expiresAt: 123 })))

    const events = await collect(streamAssistantReply(MESSAGES, 'en', '/today'))

    expect(events).toEqual([{ type: 'done', budget: 'exhausted', intent: 'general' }])
  })

  it('degrades to a single exhausted `done` when the session request throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))

    const events = await collect(streamAssistantReply(MESSAGES, 'en', '/today'))

    expect(events).toEqual([{ type: 'done', budget: 'exhausted', intent: 'general' }])
  })
})

describe('streamAssistantReply — SSE parsing', () => {
  beforeEach(() => {
    dataSources.ASSISTANT_API_BASE = 'https://assistant.example'
  })

  it('parses token + done events from a single chunk', async () => {
    const sse = sseResponse([
      'data: {"type":"token","content":"hello"}\n\ndata: {"type":"token","content":" world"}\n\ndata: {"type":"done","budget":"ok","intent":"general"}\n\n',
    ])
    const fetchSpy = vi.fn(async (url: string) =>
      url.endsWith('/api/session') ? jsonResponse({ session: 'tok-1', expiresAt: Date.now() + 3_600_000 }) : sse,
    )
    vi.stubGlobal('fetch', fetchSpy)

    const events = await collect(streamAssistantReply(MESSAGES, 'en', '/today'))

    expect(events).toEqual([
      { type: 'token', content: 'hello' },
      { type: 'token', content: ' world' },
      { type: 'done', budget: 'ok', intent: 'general' },
    ])
  })

  it('reassembles an SSE frame split across chunk boundaries', async () => {
    const sse = sseResponse([
      'data: {"type":"tok',
      'en","content":"hi"}\n\n',
      'data: {"type":"done","budget":"ok","intent":"general"}\n\n',
    ])
    const fetchSpy = vi.fn(async (url: string) =>
      url.endsWith('/api/session') ? jsonResponse({ session: 'tok-1', expiresAt: Date.now() + 3_600_000 }) : sse,
    )
    vi.stubGlobal('fetch', fetchSpy)

    const events = await collect(streamAssistantReply(MESSAGES, 'en', '/today'))

    expect(events).toEqual([
      { type: 'token', content: 'hi' },
      { type: 'done', budget: 'ok', intent: 'general' },
    ])
  })

  it('sends the session token, messages, locale, and page in the chat request body', async () => {
    const sse = sseResponse(['data: {"type":"done","budget":"ok","intent":"general"}\n\n'])
    const fetchSpy = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith('/api/session') ? jsonResponse({ session: 'tok-1', expiresAt: Date.now() + 3_600_000 }) : sse,
    )
    vi.stubGlobal('fetch', fetchSpy)

    await collect(streamAssistantReply(MESSAGES, 'ko', '/country/KR'))

    const chatCall = fetchSpy.mock.calls.find(([url]) => url.endsWith('/api/chat'))
    expect(chatCall).toBeDefined()
    const body = JSON.parse(chatCall![1]!.body as string)
    expect(body).toEqual({
      session: 'tok-1',
      messages: [{ role: 'user', content: 'hello' }],
      locale: 'ko',
      page: '/country/KR',
    })
  })

  it('trims a long conversation to the last 20 messages (the worker 400s anything longer)', async () => {
    // Arrange — ChatPanel accumulates the whole conversation, so past ~10
    // turns an untrimmed payload would be rejected outright by the worker's
    // array-length cap (MAX_HISTORY_TURNS*2). The worker's prompt builder
    // trims to the same number, so nothing the model would have seen is lost.
    const sse = sseResponse(['data: {"type":"done","budget":"ok","intent":"general"}\n\n'])
    const fetchSpy = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith('/api/session') ? jsonResponse({ session: 'tok-1', expiresAt: Date.now() + 3_600_000 }) : sse,
    )
    vi.stubGlobal('fetch', fetchSpy)
    const long: ChatMessage[] = Array.from({ length: 31 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
      timestamp: 1_756_000_000_000 + i,
    }))

    // Act
    await collect(streamAssistantReply(long, 'en', '/today'))

    // Assert — the 20 most recent, oldest-first, current turn last.
    const chatCall = fetchSpy.mock.calls.find(([url]) => url.endsWith('/api/chat'))
    const body = JSON.parse(chatCall![1]!.body as string) as { messages: ChatMessage[] }
    expect(body.messages).toHaveLength(20)
    expect(body.messages[0].content).toBe('m11')
    expect(body.messages[19].content).toBe('m30')
  })

  it('degrades to a single exhausted `done` when the chat request itself is not ok', async () => {
    const fetchSpy = vi.fn(async (url: string) =>
      url.endsWith('/api/session')
        ? jsonResponse({ session: 'tok-1', expiresAt: Date.now() + 3_600_000 })
        : jsonResponse(null, false),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const events = await collect(streamAssistantReply(MESSAGES, 'en', '/today'))

    expect(events).toEqual([{ type: 'done', budget: 'exhausted', intent: 'general' }])
  })
})

// ensureSession() caches its session token module-globally (SESSION_REFRESH_SLACK_MS),
// which every test above relies on staying valid for the rest of the file (the
// 'sends the session token...' test only reaches /api/chat because an earlier
// test in the same describe already cached one — by design, matching what a
// real ChatPanel session does). This block asserts what actually gets SENT to
// /api/session, so it needs the reverse: a demonstrably fresh, uncached
// module instance per test. vi.resetModules() + a per-test re-import gives
// that without depending on file execution order or fake-timer bookkeeping.
describe('streamAssistantReply — Turnstile token wiring (A-4)', () => {
  beforeEach(() => {
    dataSources.ASSISTANT_API_BASE = 'https://assistant.example'
  })

  async function freshStreamAssistantReply(): Promise<typeof streamAssistantReply> {
    vi.resetModules()
    const mod = await import('./assistant')
    return mod.streamAssistantReply
  }

  it('sends turnstileToken in the /api/session body when a token is available', async () => {
    turnstile.getTurnstileToken.mockResolvedValueOnce('tok-turnstile-1')
    const sse = sseResponse(['data: {"type":"done","budget":"ok","intent":"general"}\n\n'])
    const fetchSpy = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith('/api/session') ? jsonResponse({ session: 'tok-1', expiresAt: Date.now() + 3_600_000 }) : sse,
    )
    vi.stubGlobal('fetch', fetchSpy)
    const stream = await freshStreamAssistantReply()

    await collect(stream(MESSAGES, 'en', '/today'))

    const sessionCall = fetchSpy.mock.calls.find(([url]) => url.endsWith('/api/session'))
    expect(sessionCall).toBeDefined()
    const body = JSON.parse(sessionCall![1]!.body as string)
    expect(body).toEqual({ turnstileToken: 'tok-turnstile-1' })
  })

  it('sends an empty body — no turnstileToken key — when no token is available, leaving the dev-bypass-vs-401 call to the worker', async () => {
    turnstile.getTurnstileToken.mockResolvedValueOnce(null)
    const sse = sseResponse(['data: {"type":"done","budget":"ok","intent":"general"}\n\n'])
    const fetchSpy = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith('/api/session') ? jsonResponse({ session: 'tok-1', expiresAt: Date.now() + 3_600_000 }) : sse,
    )
    vi.stubGlobal('fetch', fetchSpy)
    const stream = await freshStreamAssistantReply()

    await collect(stream(MESSAGES, 'en', '/today'))

    const sessionCall = fetchSpy.mock.calls.find(([url]) => url.endsWith('/api/session'))
    const body = JSON.parse(sessionCall![1]!.body as string)
    expect(body).toEqual({})
  })

  it('resets the Turnstile widget after a token is spent, whether the worker accepted or rejected it', async () => {
    turnstile.getTurnstileToken.mockResolvedValueOnce('tok-turnstile-2')
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(null, false)))
    const stream = await freshStreamAssistantReply()

    await collect(stream(MESSAGES, 'en', '/today'))

    expect(turnstile.resetTurnstileToken).toHaveBeenCalledTimes(1)
  })

  it('does NOT reset the widget when there was no token to spend', async () => {
    turnstile.getTurnstileToken.mockResolvedValueOnce(null)
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(null, false)))
    const stream = await freshStreamAssistantReply()

    await collect(stream(MESSAGES, 'en', '/today'))

    expect(turnstile.resetTurnstileToken).not.toHaveBeenCalled()
  })

  it('still resets the widget when fetch() itself throws (network error, timeout) — not just when it resolves not-ok', async () => {
    // A prior version only called resetTurnstileToken() on the resolved-
    // response path, so a rejected/thrown fetch() (offline, AbortSignal
    // timeout firing) left the spent token stuck forever (code review, PR
    // #50 LOW #2). The "resolves ok:false" test above doesn't cover this —
    // fetch() there still resolves, it just isn't `.ok`.
    turnstile.getTurnstileToken.mockResolvedValueOnce('tok-turnstile-3')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network error')
      }),
    )
    const stream = await freshStreamAssistantReply()

    await collect(stream(MESSAGES, 'en', '/today'))

    expect(turnstile.resetTurnstileToken).toHaveBeenCalledTimes(1)
  })
})
