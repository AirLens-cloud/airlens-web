// AAA coverage for the Field Assistant client (C1 scaffold):
// - not-configured (no ASSISTANT_API_BASE) yields nothing at all
// - a failed/expired session exchange degrades to a single exhausted `done`
// - a successful session + SSE stream is parsed into the right event sequence
// - SSE frames split across chunk boundaries are still parsed correctly
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const dataSources = vi.hoisted(() => ({ ASSISTANT_API_BASE: '' }))
vi.mock('../lib/config/dataSources', () => dataSources)

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
