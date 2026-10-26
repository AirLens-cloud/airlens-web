import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { checkRateLimit, getClientIp } from './ratelimit';
import type { Env } from './types';
import wranglerToml from '../wrangler.toml?raw';
import assistantWranglerToml from '../../assistant/wrangler.toml?raw';

function makeEnv(over: Partial<Env> = {}): Env {
  return {
    DATA_ORIGIN: 'https://example.test',
    RATE_LIMIT_MAX: '120',
    RATE_LIMIT_WINDOW_SECONDS: '60',
    ALLOWED_ORIGINS: '*',
    ...over,
  };
}

/** Native Rate Limiting binding stand-in: `limit({ key })` → `{ success }`. */
function limiterStub(success: boolean) {
  return { limit: vi.fn(async (_opts: { key: string }) => ({ success })) };
}
const asBinding = (limiter: ReturnType<typeof limiterStub>) => limiter as unknown as RateLimit;

// Every test gets a fresh, silenced console.warn to assert on. (An unbound
// limiter warns once per module instance, so the first unbound call in this
// file would otherwise print.)
let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('checkRateLimit', () => {
  it('asks the binding about the client IP and allows when it says success', async () => {
    const limiter = limiterStub(true);
    const out = await checkRateLimit(makeEnv({ IP_RATE_LIMIT: asBinding(limiter) }), '203.0.113.7');
    expect(limiter.limit).toHaveBeenCalledTimes(1);
    expect(limiter.limit).toHaveBeenCalledWith({ key: '203.0.113.7' });
    expect(out).toEqual({ allowed: true, limit: 120, retryAfterSeconds: 60 });
    expect(warn).not.toHaveBeenCalled();
  });

  it('denies when the binding says no, and asks the client to wait the whole window', async () => {
    const out = await checkRateLimit(
      makeEnv({ IP_RATE_LIMIT: asBinding(limiterStub(false)) }),
      '203.0.113.7',
    );
    expect(out).toEqual({ allowed: false, limit: 120, retryAfterSeconds: 60 });
  });

  it('reports the configured budget and window', async () => {
    const out = await checkRateLimit(
      makeEnv({
        RATE_LIMIT_MAX: '30',
        RATE_LIMIT_WINDOW_SECONDS: '10',
        IP_RATE_LIMIT: asBinding(limiterStub(false)),
      }),
      '203.0.113.7',
    );
    expect(out).toEqual({ allowed: false, limit: 30, retryAfterSeconds: 10 });
  });

  it('falls back to 120 per 60 s when the vars are empty or not numbers', async () => {
    const out = await checkRateLimit(
      makeEnv({ RATE_LIMIT_MAX: '', RATE_LIMIT_WINDOW_SECONDS: 'abc' }),
      '203.0.113.7',
    );
    expect(out).toEqual({ allowed: true, limit: 120, retryAfterSeconds: 60 });
  });

  it('fails open when the binding is not bound', async () => {
    const out = await checkRateLimit(makeEnv(), '203.0.113.7');
    expect(out).toEqual({ allowed: true, limit: 120, retryAfterSeconds: 60 });
  });

  it('says so once per isolate when the binding is missing — not on every request', async () => {
    // A fresh module instance, so the once-per-isolate flag starts unset.
    vi.resetModules();
    const fresh = await import('./ratelimit');
    await fresh.checkRateLimit(makeEnv(), '203.0.113.7');
    await fresh.checkRateLimit(makeEnv(), '203.0.113.8');
    await fresh.checkRateLimit(makeEnv(), '');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0])).toContain('IP_RATE_LIMIT');
  });

  it('skips the limiter when there is no client IP — an empty key would be one shared bucket', async () => {
    const limiter = limiterStub(false);
    const out = await checkRateLimit(makeEnv({ IP_RATE_LIMIT: asBinding(limiter) }), '');
    expect(out.allowed).toBe(true);
    expect(limiter.limit).not.toHaveBeenCalled();
  });

  it('fails open and logs when the binding throws', async () => {
    const limiter = {
      limit: vi.fn(async () => {
        throw new Error('limiter down');
      }),
    };
    const out = await checkRateLimit(
      makeEnv({ IP_RATE_LIMIT: limiter as unknown as RateLimit }),
      '203.0.113.7',
    );
    expect(out).toEqual({ allowed: true, limit: 120, retryAfterSeconds: 60 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0])).toContain('failing open');
    // The log line says what failed, not who was being limited.
    expect(String(warn.mock.calls[0])).not.toContain('203.0.113.7');
  });
});

describe('getClientIp', () => {
  const req = (headers: Record<string, string>) => new Request('https://api.airlens.cloud/', { headers });

  it('prefers CF-Connecting-IP', () => {
    expect(getClientIp(req({ 'CF-Connecting-IP': '9.9.9.9', 'X-Forwarded-For': '1.1.1.1' }))).toBe('9.9.9.9');
  });

  it('falls back to the first X-Forwarded-For hop, trimmed', () => {
    expect(getClientIp(req({ 'X-Forwarded-For': ' 7.7.7.7 , 10.0.0.1' }))).toBe('7.7.7.7');
  });

  it('is empty when neither header is present', () => {
    expect(getClientIp(req({}))).toBe('');
  });
});

// The limit lives twice in wrangler.toml: the `[[ratelimits]]` binding enforces
// it, the two [vars] only feed the RateLimit-Limit / Retry-After headers. And a
// binding that is dropped or renamed fails open without an error. Nothing but
// these tests ties the file to the code, so read the file.
describe('wrangler.toml', () => {
  const block = wranglerToml.slice(wranglerToml.indexOf('[[ratelimits]]'));
  const numberIn = (text: string, pattern: RegExp) => Number(pattern.exec(text)?.[1]);
  const namespaceIds = (toml: string) => [...toml.matchAll(/^namespace_id\s*=\s*"(\d+)"/gm)].map((m) => m[1]);

  it('declares the binding under the name ratelimit.ts reads', () => {
    expect(block.startsWith('[[ratelimits]]')).toBe(true);
    expect(block).toMatch(/^name\s*=\s*"IP_RATE_LIMIT"/m);
  });

  it('keeps the numbers in the headers equal to what the binding enforces', () => {
    const limit = numberIn(block, /limit\s*=\s*(\d+)/);
    const period = numberIn(block, /period\s*=\s*(\d+)/);
    expect(numberIn(wranglerToml, /^RATE_LIMIT_MAX\s*=\s*"(\d+)"/m)).toBe(limit);
    expect(numberIn(wranglerToml, /^RATE_LIMIT_WINDOW_SECONDS\s*=\s*"(\d+)"/m)).toBe(period);
  });

  it('uses a period Cloudflare accepts (10 or 60 seconds)', () => {
    expect([10, 60]).toContain(numberIn(block, /period\s*=\s*(\d+)/));
  });

  it('does not share its namespace_id with the assistant Worker — they would share counters', () => {
    const mine = namespaceIds(wranglerToml);
    const theirs = namespaceIds(assistantWranglerToml);
    expect(mine).toHaveLength(1);
    expect(theirs.length).toBeGreaterThan(0);
    expect(mine.filter((id) => theirs.includes(id))).toEqual([]);
  });
});
