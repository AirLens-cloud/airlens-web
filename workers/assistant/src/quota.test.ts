// quota.test.ts — 3-layer rate/quota guard unit tests. AAA pattern; KV
// stubbed in-memory (no Cloudflare runtime needed). Ported from the retired
// chatbot worker's src/quota.test.ts, keyed by identifier instead of userId.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkDailyQuota, checkGlobalBudget, checkRateLimit } from './quota';
import type { Env } from './types';

class MemoryKV {
  store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string, _opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }
}

class ThrowingKV {
  async get(): Promise<string | null> {
    throw new Error('KV unavailable');
  }
  async put(): Promise<void> {
    throw new Error('KV unavailable');
  }
}

function makeEnv(kv: MemoryKV | ThrowingKV | undefined, overrides: Partial<Env> = {}): Env {
  return {
    CHAT_QUOTA: kv as unknown as KVNamespace,
    RATE_LIMIT_PER_MINUTE: '5',
    DAILY_MESSAGE_LIMIT: '3',
    DAILY_REQUEST_BUDGET: '1000',
    REQUEST_COST_ESTIMATE: '300',
    ...overrides,
  } as Env;
}

describe('checkRateLimit — per-minute burst cap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks the (limit+1)th request within the same minute', async () => {
    // Arrange
    const kv = new MemoryKV();
    const env = makeEnv(kv, { RATE_LIMIT_PER_MINUTE: '2' });
    // Act
    const first = await checkRateLimit(env, 's:abc');
    const second = await checkRateLimit(env, 's:abc');
    const third = await checkRateLimit(env, 's:abc');
    // Assert
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
  });

  it('isolates counters per identifier', async () => {
    // Arrange
    const kv = new MemoryKV();
    const env = makeEnv(kv, { RATE_LIMIT_PER_MINUTE: '1' });
    // Act / Assert
    expect((await checkRateLimit(env, 's:abc')).allowed).toBe(true);
    expect((await checkRateLimit(env, 's:abc')).allowed).toBe(false);
    expect((await checkRateLimit(env, 'ip:203.0.113.1')).allowed).toBe(true);
  });

  it('fails open when CHAT_QUOTA is unbound', async () => {
    // Arrange
    const env = makeEnv(undefined);
    // Act / Assert
    expect((await checkRateLimit(env, 's:abc')).allowed).toBe(true);
  });
});

describe('checkDailyQuota — per-identifier daily cap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks the (limit+1)th request and does not advance the counter on denial', async () => {
    // Arrange
    const kv = new MemoryKV();
    const env = makeEnv(kv, { DAILY_MESSAGE_LIMIT: '3' });
    // Act
    await checkDailyQuota(env, 's:abc');
    await checkDailyQuota(env, 's:abc');
    const third = await checkDailyQuota(env, 's:abc');
    const fourth = await checkDailyQuota(env, 's:abc');
    // Assert
    expect(third.allowed).toBe(true);
    expect(fourth.allowed).toBe(false);
    expect(kv.store.get('quota:day:s:abc:2026-09-02')).toBe('3');
  });

  it('resets on UTC date rollover', async () => {
    // Arrange
    const kv = new MemoryKV();
    kv.store.set('quota:day:s:abc:2026-09-02', '3');
    const env = makeEnv(kv, { DAILY_MESSAGE_LIMIT: '3' });
    expect((await checkDailyQuota(env, 's:abc')).allowed).toBe(false);
    // Act
    vi.setSystemTime(new Date('2026-09-03T00:00:01Z'));
    const nextDay = await checkDailyQuota(env, 's:abc');
    // Assert
    expect(nextDay.allowed).toBe(true);
  });

  it('falls back to the IP-prefixed identifier acting as its own independent cap', async () => {
    // Arrange — an IP-fallback identifier (no session) is just another key.
    const kv = new MemoryKV();
    const env = makeEnv(kv, { DAILY_MESSAGE_LIMIT: '1' });
    // Act / Assert
    expect((await checkDailyQuota(env, 'ip:203.0.113.1')).allowed).toBe(true);
    expect((await checkDailyQuota(env, 'ip:203.0.113.1')).allowed).toBe(false);
    expect((await checkDailyQuota(env, 's:abc')).allowed).toBe(true);
  });

  it('fails open when DAILY_MESSAGE_LIMIT is missing or invalid', async () => {
    // Arrange
    const kv = new MemoryKV();
    // Act / Assert
    expect((await checkDailyQuota(makeEnv(kv, { DAILY_MESSAGE_LIMIT: undefined }), 's:abc')).allowed).toBe(true);
    expect((await checkDailyQuota(makeEnv(kv, { DAILY_MESSAGE_LIMIT: '0' }), 's:abc')).allowed).toBe(true);
    expect(kv.store.size).toBe(0);
  });
});

describe('checkGlobalBudget — account-wide daily request budget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accumulates a single global counter across identifiers', async () => {
    // Arrange
    const kv = new MemoryKV();
    const env = makeEnv(kv, { DAILY_REQUEST_BUDGET: '1000', REQUEST_COST_ESTIMATE: '300' });
    // Act
    const r1 = await checkGlobalBudget(env);
    const r2 = await checkGlobalBudget(env);
    // Assert
    expect(r1.consumed).toBe(300);
    expect(r2.consumed).toBe(600);
  });

  it('blocks once the next request would exceed budget, without advancing the counter', async () => {
    // Arrange
    const kv = new MemoryKV();
    const env = makeEnv(kv, { DAILY_REQUEST_BUDGET: '1000', REQUEST_COST_ESTIMATE: '400' });
    // Act
    await checkGlobalBudget(env);
    await checkGlobalBudget(env);
    const third = await checkGlobalBudget(env);
    // Assert
    expect(third.allowed).toBe(false);
    expect(third.consumed).toBe(800);
  });

  it('fails open when the KV store throws', async () => {
    // Arrange
    const env = makeEnv(new ThrowingKV(), { DAILY_REQUEST_BUDGET: '1000', REQUEST_COST_ESTIMATE: '300' });
    // Act
    const result = await checkGlobalBudget(env);
    // Assert
    expect(result.allowed).toBe(true);
  });
});
