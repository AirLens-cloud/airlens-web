import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit, getClientIp } from './ratelimit';
import type { Env } from './types';

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

afterEach(() => vi.restoreAllMocks());

describe('checkRateLimit', () => {
  it('asks the binding about the client IP and allows when it says success', async () => {
    const limiter = limiterStub(true);
    const out = await checkRateLimit(makeEnv({ IP_RATE_LIMIT: asBinding(limiter) }), '203.0.113.7');
    expect(limiter.limit).toHaveBeenCalledTimes(1);
    expect(limiter.limit).toHaveBeenCalledWith({ key: '203.0.113.7' });
    expect(out).toEqual({ allowed: true, limit: 120, retryAfterSeconds: 60 });
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

  it('fails open when the binding is not bound (dev/test)', async () => {
    const out = await checkRateLimit(makeEnv(), '203.0.113.7');
    expect(out).toEqual({ allowed: true, limit: 120, retryAfterSeconds: 60 });
  });

  it('skips the limiter when there is no client IP — an empty key would be one shared bucket', async () => {
    const limiter = limiterStub(false);
    const out = await checkRateLimit(makeEnv({ IP_RATE_LIMIT: asBinding(limiter) }), '');
    expect(out.allowed).toBe(true);
    expect(limiter.limit).not.toHaveBeenCalled();
  });

  it('fails open and logs when the binding throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
