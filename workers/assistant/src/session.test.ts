// session.test.ts — session token sign/verify + Turnstile dev-bypass.
// AAA pattern; no KV needed (Web Crypto only).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { issueSessionToken, resolveIdentifier, verifySessionToken, verifyTurnstile } from './session';
import type { Env } from './types';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SESSION_HMAC_SECRET: 'test-secret-do-not-use-in-prod',
    SESSION_TTL_SECONDS: '3600',
    RATE_LIMIT_PER_MINUTE: '5',
    DAILY_MESSAGE_LIMIT: '30',
    DAILY_REQUEST_BUDGET: '2000',
    REQUEST_COST_ESTIMATE: '1',
    MAX_MESSAGE_LENGTH: '2000',
    MAX_HISTORY_TURNS: '10',
    ALLOWED_ORIGINS: 'https://airlens.cloud',
    ...overrides,
  } as Env;
}

describe('issueSessionToken / verifySessionToken', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues a token that verifies successfully and carries a future expiry', async () => {
    // Arrange
    const env = makeEnv();
    // Act
    const { token, payload } = await issueSessionToken(env, 3600);
    const verified = await verifySessionToken(env, token);
    // Assert
    expect(verified).not.toBeNull();
    expect(verified?.sid).toBe(payload.sid);
    expect(payload.exp).toBe(payload.iat + 3600);
  });

  it('rejects a token signed with a different secret (tamper-evident)', async () => {
    // Arrange
    const issuingEnv = makeEnv({ SESSION_HMAC_SECRET: 'secret-a' });
    const verifyingEnv = makeEnv({ SESSION_HMAC_SECRET: 'secret-b' });
    // Act
    const { token } = await issueSessionToken(issuingEnv, 3600);
    const verified = await verifySessionToken(verifyingEnv, token);
    // Assert
    expect(verified).toBeNull();
  });

  it('rejects an expired token', async () => {
    // Arrange
    const env = makeEnv();
    const { token } = await issueSessionToken(env, 60);
    // Act — advance past expiry
    vi.setSystemTime(new Date('2026-09-02T10:02:00Z'));
    const verified = await verifySessionToken(env, token);
    // Assert
    expect(verified).toBeNull();
  });

  it('rejects malformed tokens without throwing', async () => {
    // Arrange
    const env = makeEnv();
    // Act / Assert
    await expect(verifySessionToken(env, 'not-a-token')).resolves.toBeNull();
    await expect(verifySessionToken(env, '')).resolves.toBeNull();
    await expect(verifySessionToken(env, undefined)).resolves.toBeNull();
    await expect(verifySessionToken(env, 'a.b.c')).resolves.toBeNull();
  });

  it('throws when SESSION_HMAC_SECRET is not configured (no silent insecure issuance)', async () => {
    // Arrange
    const env = makeEnv({ SESSION_HMAC_SECRET: undefined });
    // Act / Assert
    await expect(issueSessionToken(env, 3600)).rejects.toThrow();
  });
});

describe('verifyTurnstile', () => {
  it('dev-bypasses (allows + warns) when TURNSTILE_SECRET is unset', async () => {
    // Arrange
    const env = makeEnv({ TURNSTILE_SECRET: undefined });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Act
    const result = await verifyTurnstile(env, undefined, '203.0.113.1');
    // Assert
    expect(result).toEqual({ ok: true, devBypass: true });
    expect(warnSpy).toHaveBeenCalledOnce();
    // A prose-only warning is not searchable in Workers Logs — the fail-open
    // must emit a stable, greppable token so "is the bot gate actually off in
    // production right now?" is answerable from the log query alone.
    expect(warnSpy.mock.calls.flat().map(String).join(' ')).toContain('ASSISTANT_TURNSTILE_FAIL_OPEN');
    warnSpy.mockRestore();
  });

  it('rejects when TURNSTILE_SECRET is set but no token is provided', async () => {
    // Arrange
    const env = makeEnv({ TURNSTILE_SECRET: 'ts-secret' });
    // Act
    const result = await verifyTurnstile(env, undefined, '203.0.113.1');
    // Assert
    expect(result).toEqual({ ok: false, devBypass: false });
  });

  it('calls siteverify and honors its success field when TURNSTILE_SECRET is set', async () => {
    // Arrange
    const env = makeEnv({ TURNSTILE_SECRET: 'ts-secret' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    // Act
    const result = await verifyTurnstile(env, 'client-token', '203.0.113.1');
    // Assert
    expect(result).toEqual({ ok: true, devBypass: false });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' }),
    );
    fetchSpy.mockRestore();
  });

  it('fails closed when siteverify reports failure', async () => {
    // Arrange
    const env = makeEnv({ TURNSTILE_SECRET: 'ts-secret' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }));
    // Act
    const result = await verifyTurnstile(env, 'client-token', '203.0.113.1');
    // Assert
    expect(result.ok).toBe(false);
    fetchSpy.mockRestore();
  });

  it('fails closed (not open) when the siteverify call itself throws', async () => {
    // Arrange — a real secret is configured, so a network blip must not
    // silently grant a session the way the dev-bypass does.
    const env = makeEnv({ TURNSTILE_SECRET: 'ts-secret' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    // Act
    const result = await verifyTurnstile(env, 'client-token', '203.0.113.1');
    // Assert
    expect(result).toEqual({ ok: false, devBypass: false });
    fetchSpy.mockRestore();
  });
});

describe('resolveIdentifier', () => {
  it('keys on the client IP, not the session — a fresh session from the same IP reuses one daily counter', async () => {
    // Arrange — sessions are issued anonymously and unlimited, so a
    // session-keyed daily cap is a cap on nothing (call /api/session again,
    // get a fresh 30-message budget). Identity has to follow the caller.
    const env = makeEnv();
    // Act
    const a = await resolveIdentifier(env, 'sid-one', '203.0.113.1');
    const b = await resolveIdentifier(env, 'sid-two', '203.0.113.1');
    // Assert
    expect(a).toBe(b);
    expect(a.startsWith('ip:')).toBe(true);
  });

  it('never carries the raw IP into the KV key', async () => {
    // Arrange / Act
    const id = await resolveIdentifier(makeEnv(), 'sid-one', '203.0.113.1');
    // Assert — a leaked key listing must not be a visitor-IP log.
    expect(id).not.toContain('203.0.113.1');
  });

  it('separates different IPs', async () => {
    // Arrange
    const env = makeEnv();
    // Act
    const a = await resolveIdentifier(env, null, '203.0.113.1');
    const b = await resolveIdentifier(env, null, '198.51.100.7');
    // Assert
    expect(a).not.toBe(b);
  });

  it('rotates the hash every UTC day, so the key is not a persistent device identifier', async () => {
    // Arrange
    const env = makeEnv();
    vi.useFakeTimers();
    // Act
    vi.setSystemTime(new Date('2026-09-03T23:59:00Z'));
    const today = await resolveIdentifier(env, null, '203.0.113.1');
    vi.setSystemTime(new Date('2026-09-04T00:01:00Z'));
    const tomorrow = await resolveIdentifier(env, null, '203.0.113.1');
    vi.useRealTimers();
    // Assert
    expect(today).not.toBe(tomorrow);
  });

  it('peppers the hash with SESSION_HMAC_SECRET (a bare sha256 of an IPv4 is brute-forceable)', async () => {
    // Arrange / Act — the whole IPv4 space is ~4.3e9 hashes; without a
    // secret pepper, a leaked key listing is a reversible IP oracle.
    const a = await resolveIdentifier(makeEnv({ SESSION_HMAC_SECRET: 'secret-a' }), null, '203.0.113.1');
    const b = await resolveIdentifier(makeEnv({ SESSION_HMAC_SECRET: 'secret-b' }), null, '203.0.113.1');
    // Assert
    expect(a).not.toBe(b);
  });

  it('falls back to the hashed session id when the request carries no client IP', async () => {
    // Arrange / Act — non-browser callers (health probes, curl) have no
    // CF-Connecting-IP; the session hash is still better than one shared
    // "unknown" bucket for everyone.
    const id = await resolveIdentifier(makeEnv(), 'some-session-uuid', '');
    // Assert
    expect(id.startsWith('s:')).toBe(true);
    expect(id).not.toContain('some-session-uuid');
  });
});
