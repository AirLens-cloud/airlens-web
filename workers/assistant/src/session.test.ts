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
  it('hashes the session id rather than using it verbatim', async () => {
    // Arrange / Act
    const id = await resolveIdentifier('some-session-uuid', '203.0.113.1');
    // Assert
    expect(id.startsWith('s:')).toBe(true);
    expect(id).not.toContain('some-session-uuid');
  });

  it('falls back to an ip-prefixed key when there is no session', async () => {
    // Arrange / Act
    const id = await resolveIdentifier(null, '203.0.113.1');
    // Assert
    expect(id).toBe('ip:203.0.113.1');
  });

  it('is deterministic for the same session id (KV key stability)', async () => {
    // Arrange / Act
    const a = await resolveIdentifier('same-sid', '203.0.113.1');
    const b = await resolveIdentifier('same-sid', '198.51.100.7');
    // Assert — identity follows the session, not the IP, once a session exists
    expect(a).toBe(b);
  });
});
