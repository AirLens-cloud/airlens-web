import { describe, expect, it } from 'vitest';

import type { Env } from './index';
import { checkSubmissionRateLimit } from './ratelimit';

/** Minimal in-memory KVNamespace stand-in — enough of the surface ratelimit.ts uses. */
function mockKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as KVNamespace;
}

function stubEnv(overrides: Partial<Env> = {}): Env {
  return {
    airlens_db: {} as unknown as D1Database,
    TURNSTILE_SECRET_KEY: 'secret',
    SUBMITTER_HASH_SECRET: 'secret',
    ALLOWED_ORIGINS: 'https://airlens.cloud',
    OBS_RATE_PER_MIN: '3',
    OBS_RATE_PER_DAY: '20',
    ...overrides,
  };
}

describe('checkSubmissionRateLimit', () => {
  it('allows requests under both the per-minute and per-day limits', async () => {
    // Arrange
    const env = stubEnv({ RL_KV: mockKv() });

    // Act
    const result = await checkSubmissionRateLimit(env, '1.2.3.4', 'obs');

    // Assert
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('denies once the per-minute limit is exceeded', async () => {
    // Arrange
    const env = stubEnv({ RL_KV: mockKv(), OBS_RATE_PER_MIN: '2' });

    // Act — first two calls consume the per-minute budget, the third is denied
    await checkSubmissionRateLimit(env, '1.2.3.4', 'obs');
    await checkSubmissionRateLimit(env, '1.2.3.4', 'obs');
    const third = await checkSubmissionRateLimit(env, '1.2.3.4', 'obs');

    // Assert
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThanOrEqual(0);
  });

  it('does not deny a different IP after one IP exhausts its limit', async () => {
    // Arrange
    const env = stubEnv({ RL_KV: mockKv(), OBS_RATE_PER_MIN: '1' });

    // Act
    await checkSubmissionRateLimit(env, '1.2.3.4', 'obs');
    const other = await checkSubmissionRateLimit(env, '5.6.7.8', 'obs');

    // Assert
    expect(other.allowed).toBe(true);
  });

  it('tracks kind counters independently — exhausting "obs" does not deny "ts" for the same IP', async () => {
    // Arrange
    const env = stubEnv({ RL_KV: mockKv(), OBS_RATE_PER_MIN: '1' });

    // Act
    await checkSubmissionRateLimit(env, '1.2.3.4', 'obs'); // consumes obs budget
    const obsThird = await checkSubmissionRateLimit(env, '1.2.3.4', 'obs');
    const tsFirst = await checkSubmissionRateLimit(env, '1.2.3.4', 'ts');

    // Assert
    expect(obsThird.allowed).toBe(false);
    expect(tsFirst.allowed).toBe(true);
  });

  it('normalizes IPv6 addresses to their /64 prefix, so rotating within it cannot bypass the limit', async () => {
    // Arrange
    const env = stubEnv({ RL_KV: mockKv(), OBS_RATE_PER_MIN: '1' });
    const ipA = '2001:db8:1234:5678:aaaa:bbbb:cccc:0001';
    const ipB = '2001:db8:1234:5678:1111:2222:3333:4444'; // same /64 as ipA

    // Act
    await checkSubmissionRateLimit(env, ipA, 'obs');
    const second = await checkSubmissionRateLimit(env, ipB, 'obs');

    // Assert
    expect(second.allowed).toBe(false);
  });

  it('does not conflate two different IPv6 /64 prefixes', async () => {
    // Arrange
    const env = stubEnv({ RL_KV: mockKv(), OBS_RATE_PER_MIN: '1' });
    const ipA = '2001:db8:1234:5678::1';
    const ipC = '2001:db8:9999:9999::1'; // different /64

    // Act
    await checkSubmissionRateLimit(env, ipA, 'obs');
    const other = await checkSubmissionRateLimit(env, ipC, 'obs');

    // Assert
    expect(other.allowed).toBe(true);
  });

  it('fails open when RL_KV is unbound', async () => {
    // Arrange
    const env = stubEnv();

    // Act
    const result = await checkSubmissionRateLimit(env, '1.2.3.4', 'obs');

    // Assert
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('fails open when the rate limit vars are not valid numbers', async () => {
    // Arrange
    const env = stubEnv({ RL_KV: mockKv(), OBS_RATE_PER_MIN: 'not-a-number' });

    // Act
    const result = await checkSubmissionRateLimit(env, '1.2.3.4', 'obs');

    // Assert
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('fails open when the KV binding throws', async () => {
    // Arrange
    const brokenKv = {
      get: async () => {
        throw new Error('KV unavailable');
      },
      put: async () => {
        throw new Error('KV unavailable');
      },
    } as unknown as KVNamespace;
    const env = stubEnv({ RL_KV: brokenKv });

    // Act
    const result = await checkSubmissionRateLimit(env, '1.2.3.4', 'obs');

    // Assert
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });
});
