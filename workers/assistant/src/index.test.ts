// index.test.ts — top-level routing/CORS/handler integration smoke tests.
// AAA pattern; CHAT_QUOTA omitted throughout (quota guards fail open — this
// file is about routing/session/RAG-wiring/reindex-auth, not the quota math
// itself (quota.test.ts) or the RAG internals (rag.test.ts, chat-stream.test.ts).
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from './index';
import type { Env } from './types';

const ORIGIN = 'https://airlens.cloud';

/** Same duality as chat-stream.test.ts's makeAiRun: answers bge-m3 embedding
 *  calls (input.text) and gemma chat calls (input.messages, stream:true)
 *  differently, so both handleChat's embed-then-generate calls resolve. */
function mockAiRun(replyWords: string[] = ['mocked', ' ', 'reply']) {
  return vi.fn(async (_model: string, input: { text?: string | string[]; messages?: unknown }) => {
    if (input.text !== undefined) {
      const texts = Array.isArray(input.text) ? input.text : [input.text];
      return { data: texts.map(() => [0.1, 0.2, 0.3]) };
    }
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const w of replyWords) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: w })}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
  });
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SESSION_HMAC_SECRET: 'test-secret',
    SESSION_TTL_SECONDS: '3600',
    RATE_LIMIT_PER_MINUTE: '5',
    DAILY_MESSAGE_LIMIT: '30',
    DAILY_REQUEST_BUDGET: '10000',
    REQUEST_COST_ESTIMATE: '25',
    MAX_MESSAGE_LENGTH: '2000',
    MAX_HISTORY_TURNS: '10',
    ALLOWED_ORIGINS: ORIGIN,
    CHAT_MODEL: '@cf/google/gemma-4-26b-a4b-it',
    EMBEDDING_MODEL: '@cf/baai/bge-m3',
    MAX_TOKENS: '512',
    TEMPERATURE: '0.3',
    RAG_TOP_K: '5',
    AI: { run: mockAiRun() } as unknown as Ai,
    ...overrides,
  } as Env;
}

const ctx = {} as ExecutionContext;

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe('CORS + origin allowlist', () => {
  it('rejects a browser request from an unlisted origin', async () => {
    // Arrange
    const req = new Request('https://worker.example/api/chat/health', {
      headers: { Origin: 'https://evil.example' },
    });
    // Act
    const res = await worker.fetch(req, makeEnv(), ctx);
    // Assert
    expect(res.status).toBe(403);
    expect((await readJson<{ code?: string }>(res)).code).toBe('origin_denied');
  });

  it('allows a request with no Origin header (non-browser / health probe)', async () => {
    // Arrange
    const req = new Request('https://worker.example/api/chat/health');
    // Act
    const res = await worker.fetch(req, makeEnv(), ctx);
    // Assert
    expect(res.status).toBe(200);
  });
});

describe('POST /api/session', () => {
  it('dev-bypasses and issues a session when TURNSTILE_SECRET is unset', async () => {
    // Arrange
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const req = new Request('https://worker.example/api/session', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Act
    const res = await worker.fetch(req, makeEnv(), ctx);
    const body = await readJson<{ session?: unknown; devBypass?: boolean }>(res);
    // Assert
    expect(res.status).toBe(200);
    expect(typeof body.session).toBe('string');
    expect(body.devBypass).toBe(true);
    warnSpy.mockRestore();
  });
});

describe('POST /api/chat', () => {
  async function issueSession(env: Env): Promise<string> {
    const res = await worker.fetch(
      new Request('https://worker.example/api/session', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: '{}',
      }),
      env,
      ctx,
    );
    const body = await readJson<{ session: string }>(res);
    return body.session;
  }

  it('rejects a request without a valid session', async () => {
    // Arrange
    const req = new Request('https://worker.example/api/chat', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: 'bogus', messages: [{ role: 'user', content: 'hi' }] }),
    });
    // Act
    const res = await worker.fetch(req, makeEnv(), ctx);
    // Assert
    expect(res.status).toBe(401);
    expect((await readJson<{ code?: string }>(res)).code).toBe('turnstile_failed');
  });

  it('streams a RAG-generated answer as SSE token events, ending in done', async () => {
    // Arrange
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = makeEnv({ AI: { run: mockAiRun(['Hello', ' ', 'there']) } as unknown as Ai });
    const session = await issueSession(env);
    const req = new Request('https://worker.example/api/chat', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, messages: [{ role: 'user', content: 'hello world' }] }),
    });
    // Act
    const res = await worker.fetch(req, env, ctx);
    // Assert
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    const text = await res.text();
    expect(text).toContain('"type":"token"');
    expect(text).toContain('"content":"Hello"');
    expect(text).toContain('"content":"there"');
    expect(text).toContain('"type":"done"');
    expect(text).toContain('"budget":"ok"');
    // No VECTORIZE binding in this env — nothing was retrieved, so no
    // fabricated citations event (Glass-box: never imply a search happened).
    expect(text).not.toContain('"type":"citations"');
  });

  it('degrades to a RAG-only (no-generation) reply when the daily request budget is exhausted', async () => {
    // Arrange
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const run = mockAiRun(['should not be reached']);
    const env = makeEnv({
      AI: { run } as unknown as Ai,
      CHAT_QUOTA: {
        // Only the global-budget key (quota:budget:*) is already exhausted —
        // the per-identifier rate-limit and daily-quota keys stay unset so
        // this test isolates the budget guard, not the other two.
        get: vi.fn((key: string) => Promise.resolve(key.startsWith('quota:budget:') ? String(10_000) : null)),
        put: vi.fn().mockResolvedValue(undefined),
      } as unknown as KVNamespace,
    });
    const session = await issueSession(env);
    const req = new Request('https://worker.example/api/chat', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, messages: [{ role: 'user', content: 'hello world' }] }),
    });
    // Act
    const res = await worker.fetch(req, env, ctx);
    const text = await res.text();
    // Assert
    expect(text).toContain('"budget":"exhausted"');
    // The degraded path never calls the chat model — every AI.run call was
    // an embedding call (input.text), never a chat call (input.messages).
    for (const call of run.mock.calls) {
      const input = call[1] as { text?: unknown; messages?: unknown };
      expect(input.text).toBeDefined();
      expect(input.messages).toBeUndefined();
    }
  });

  it('rejects a body with no user-role message', async () => {
    // Arrange
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = makeEnv();
    const session = await issueSession(env);
    const req = new Request('https://worker.example/api/chat', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, messages: [{ role: 'assistant', content: 'hi' }] }),
    });
    // Act
    const res = await worker.fetch(req, env, ctx);
    // Assert
    expect(res.status).toBe(400);
    expect((await readJson<{ code?: string }>(res)).code).toBe('invalid_body');
  });
});

describe('POST /api/admin/reindex', () => {
  const CHUNK = { id: 'faq:aqi-scale', text: 'AQI scale text', source_title: 'AQI scale', source_url: '/faq#aqi-scale', category: 'faq' };

  function req(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('https://worker.example/api/admin/reindex', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  it('refuses every request when ADMIN_REINDEX_SECRET is unset (fail closed, not fail open)', async () => {
    // Arrange
    const env = makeEnv(); // no ADMIN_REINDEX_SECRET
    // Act
    const res = await worker.fetch(req({ chunks: [CHUNK] }, { 'x-admin-secret': 'anything' }), env, ctx);
    // Assert
    expect(res.status).toBe(503);
  });

  it('rejects a request with no x-admin-secret header', async () => {
    // Arrange
    const env = makeEnv({ ADMIN_REINDEX_SECRET: 'correct-secret' });
    // Act
    const res = await worker.fetch(req({ chunks: [CHUNK] }), env, ctx);
    // Assert
    expect(res.status).toBe(401);
  });

  it('rejects a request with the wrong x-admin-secret', async () => {
    // Arrange
    const env = makeEnv({ ADMIN_REINDEX_SECRET: 'correct-secret' });
    // Act
    const res = await worker.fetch(req({ chunks: [CHUNK] }, { 'x-admin-secret': 'wrong' }), env, ctx);
    // Assert
    expect(res.status).toBe(401);
  });

  it('rejects an empty chunks array', async () => {
    // Arrange
    const env = makeEnv({ ADMIN_REINDEX_SECRET: 'correct-secret' });
    // Act
    const res = await worker.fetch(req({ chunks: [] }, { 'x-admin-secret': 'correct-secret' }), env, ctx);
    // Assert
    expect(res.status).toBe(400);
  });

  it('embeds and upserts the chunks, returning the indexed count, when the secret matches', async () => {
    // Arrange
    const upsert = vi.fn().mockResolvedValue({ count: 1, ids: [CHUNK.id] });
    const env = makeEnv({
      ADMIN_REINDEX_SECRET: 'correct-secret',
      VECTORIZE: { upsert } as unknown as VectorizeIndex,
    });
    // Act
    const res = await worker.fetch(req({ chunks: [CHUNK] }, { 'x-admin-secret': 'correct-secret' }), env, ctx);
    // Assert
    expect(res.status).toBe(200);
    expect(await readJson<{ indexed: number; batches: number }>(res)).toEqual({ indexed: 1, batches: 1 });
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
