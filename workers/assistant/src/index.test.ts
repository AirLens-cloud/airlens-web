// index.test.ts — top-level routing/CORS/handler integration smoke tests.
// AAA pattern; CHAT_QUOTA omitted throughout (quota guards fail open — this
// file is about routing/session/echo wiring, not the quota math itself,
// which is covered by quota.test.ts).
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from './index';
import type { Env } from './types';

const ORIGIN = 'https://airlens.cloud';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SESSION_HMAC_SECRET: 'test-secret',
    SESSION_TTL_SECONDS: '3600',
    RATE_LIMIT_PER_MINUTE: '5',
    DAILY_MESSAGE_LIMIT: '30',
    DAILY_REQUEST_BUDGET: '2000',
    REQUEST_COST_ESTIMATE: '1',
    MAX_MESSAGE_LENGTH: '2000',
    MAX_HISTORY_TURNS: '10',
    ALLOWED_ORIGINS: ORIGIN,
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

  it('streams the last user message back as SSE token events, ending in done', async () => {
    // Arrange
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = makeEnv();
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
    expect(text).toContain('"content":"hello"');
    expect(text).toContain('"content":"world"');
    expect(text).toContain('"type":"done"');
    expect(text).toContain('"budget":"ok"');
    // No fabricated citations event in echo mode.
    expect(text).not.toContain('"type":"citations"');
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

afterEach(() => {
  vi.restoreAllMocks();
});
