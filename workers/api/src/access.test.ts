import { afterEach, describe, expect, it, vi } from 'vitest';

import { authenticateAccessRequest, resetAccessCacheForTests, verifyAccessJwt } from './access';
import type { Env } from './index';

const TEAM_DOMAIN = 'test-team';
const AUD = 'test-aud-tag';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64UrlEncode(bytes: Uint8Array): string {
  let result = '';
  let buffer = 0;
  let bitsCollected = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsCollected += 8;
    while (bitsCollected >= 6) {
      bitsCollected -= 6;
      result += BASE64_CHARS[(buffer >> bitsCollected) & 0x3f];
    }
  }
  if (bitsCollected > 0) {
    result += BASE64_CHARS[(buffer << (6 - bitsCollected)) & 0x3f];
  }
  return result.replace(/\+/g, '-').replace(/\//g, '_');
}

function encodeJsonSegment(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

// access.ts caches JWKS per team-domain for an hour at module scope, and
// that module instance is shared across every test in this file (vitest
// does not reload modules between tests in the same file). Each test mints
// its own unique kid so a fresh key is always a cache MISS — the "kid not
// found -> refetch once" path in access.ts then picks up that test's
// `stubJwksFetch` response instead of a previous test's cached JWKS.
//
// That alone stopped being sufficient once the kid-miss refetch got a
// 5-minute throttle (JWKS_FORCE_REFRESH_MIN_INTERVAL_MS, see access.ts) — a
// test running within that window of a prior forced refetch would get the
// *previous* test's cached JWKS back (correctly throttled, from
// production's point of view) and see its own kid as still missing. The
// `afterEach` below resets both the cache and the throttle timestamp via
// `resetAccessCacheForTests()` so each test still starts from a clean slate.
let kidCounter = 0;
function nextKid(): string {
  kidCounter += 1;
  return `test-key-${kidCounter}`;
}

interface KeyPair {
  kid: string;
  publicJwk: JsonWebKey & { kid: string };
  privateKey: CryptoKey;
}

async function generateAccessKeyPair(kid: string = nextKid()): Promise<KeyPair> {
  const { publicKey, privateKey } = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', publicKey)) as JsonWebKey;
  return { kid, publicJwk: { ...jwk, kid }, privateKey };
}

async function signToken(
  keyPair: Pick<KeyPair, 'kid' | 'privateKey'>,
  payload: Record<string, unknown>,
  headerOverrides: Record<string, unknown> = {},
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT', kid: keyPair.kid, ...headerOverrides };
  const signingInput = `${encodeJsonSegment(header)}.${encodeJsonSegment(payload)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    email: 'admin@airlens.cloud',
    sub: 'access-sub-123',
    aud: AUD,
    iss: `https://${TEAM_DOMAIN}.cloudflareaccess.com`,
    iat: now,
    exp: now + 3600,
    nbf: now - 10,
    ...overrides,
  };
}

function stubEnv(overrides: Partial<Env> = {}): Env {
  return {
    airlens_db: {} as Env['airlens_db'],
    TURNSTILE_SECRET_KEY: 'secret',
    SUBMITTER_HASH_SECRET: 'secret',
    ALLOWED_ORIGINS: 'https://airlens.cloud',
    OBS_RATE_PER_MIN: '3',
    OBS_RATE_PER_DAY: '20',
    ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
    ACCESS_AUD: AUD,
    // Matches validPayload()'s default `email` — the allowlist is the
    // second, independent authorization gate (S1) every token still has to
    // clear, so tests exercising the *token verification* path (signature,
    // exp, iss, aud, kid...) need this set to reach `ok: true` at all.
    // Allowlist-specific behavior (missing/non-matching email, unset var)
    // is exercised by its own describe block below.
    ACCESS_ALLOWED_EMAILS: 'admin@airlens.cloud',
    ...overrides,
  };
}

function stubJwksFetch(...jwks: Array<JsonWebKey & { kid: string }>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ keys: jwks }), { status: 200 })),
  );
}

describe('verifyAccessJwt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetAccessCacheForTests();
  });

  it('accepts a validly signed token from the configured team/aud', async () => {
    // Arrange
    const keyPair = await generateAccessKeyPair();
    stubJwksFetch(keyPair.publicJwk);
    const token = await signToken(keyPair, validPayload());
    const env = stubEnv();

    // Act
    const result = await verifyAccessJwt(env, token);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.email).toBe('admin@airlens.cloud');
      expect(result.identity.sub).toBe('access-sub-123');
    }
  });

  it('returns 503 access_not_configured when ACCESS_TEAM_DOMAIN is unset', async () => {
    // Arrange
    const env = stubEnv({ ACCESS_TEAM_DOMAIN: undefined });

    // Act
    const result = await verifyAccessJwt(env, 'irrelevant.token.value');

    // Assert
    expect(result).toEqual({ ok: false, status: 503, error: 'access_not_configured' });
  });

  it('returns 503 access_not_configured when ACCESS_AUD is unset', async () => {
    // Arrange
    const env = stubEnv({ ACCESS_AUD: undefined });

    // Act
    const result = await verifyAccessJwt(env, 'irrelevant.token.value');

    // Assert
    expect(result).toEqual({ ok: false, status: 503, error: 'access_not_configured' });
  });

  it('rejects an expired token with 403', async () => {
    // Arrange
    const keyPair = await generateAccessKeyPair();
    stubJwksFetch(keyPair.publicJwk);
    const expired = Math.floor(Date.now() / 1000) - 7200;
    const token = await signToken(keyPair, validPayload({ exp: expired }));
    const env = stubEnv();

    // Act
    const result = await verifyAccessJwt(env, token);

    // Assert
    expect(result).toEqual({ ok: false, status: 403, error: 'access_denied' });
  });

  it('rejects a token with the wrong audience with 403', async () => {
    // Arrange
    const keyPair = await generateAccessKeyPair();
    stubJwksFetch(keyPair.publicJwk);
    const token = await signToken(keyPair, validPayload({ aud: 'someone-elses-aud' }));
    const env = stubEnv();

    // Act
    const result = await verifyAccessJwt(env, token);

    // Assert
    expect(result).toEqual({ ok: false, status: 403, error: 'access_denied' });
  });

  it('rejects a token with the wrong issuer with 403', async () => {
    // Arrange
    const keyPair = await generateAccessKeyPair();
    stubJwksFetch(keyPair.publicJwk);
    const token = await signToken(keyPair, validPayload({ iss: 'https://not-the-team.cloudflareaccess.com' }));
    const env = stubEnv();

    // Act
    const result = await verifyAccessJwt(env, token);

    // Assert
    expect(result).toEqual({ ok: false, status: 403, error: 'access_denied' });
  });

  it('rejects a token whose kid is absent from the JWKS with 403', async () => {
    // Arrange
    const registeredKeyPair = await generateAccessKeyPair();
    const unknownKeyPair = await generateAccessKeyPair();
    stubJwksFetch(registeredKeyPair.publicJwk); // JWKS never advertises unknownKeyPair's kid
    const token = await signToken(unknownKeyPair, validPayload());
    const env = stubEnv();

    // Act
    const result = await verifyAccessJwt(env, token);

    // Assert
    expect(result).toEqual({ ok: false, status: 403, error: 'access_denied' });
  });

  it('rejects a token signed by a different key than the one its kid names with 403', async () => {
    // Arrange
    const registeredKeyPair = await generateAccessKeyPair();
    const attackerKeyPair = await generateAccessKeyPair();
    stubJwksFetch(registeredKeyPair.publicJwk);
    // Signs with the attacker's private key but claims the registered kid —
    // signature verification against the registered public key must fail.
    const token = await signToken(attackerKeyPair, validPayload(), { kid: registeredKeyPair.kid });
    const env = stubEnv();

    // Act
    const result = await verifyAccessJwt(env, token);

    // Assert
    expect(result).toEqual({ ok: false, status: 403, error: 'access_denied' });
  });

  it('rejects a malformed token (not 3 segments) with 403', async () => {
    // Arrange
    const env = stubEnv();

    // Act
    const result = await verifyAccessJwt(env, 'not-a-jwt');

    // Assert
    expect(result).toEqual({ ok: false, status: 403, error: 'access_denied' });
  });

  it('rejects a token whose nbf is in the future with 403', async () => {
    // Arrange
    const keyPair = await generateAccessKeyPair();
    stubJwksFetch(keyPair.publicJwk);
    const futureNbf = Math.floor(Date.now() / 1000) + 3600;
    const token = await signToken(keyPair, validPayload({ nbf: futureNbf }));
    const env = stubEnv();

    // Act
    const result = await verifyAccessJwt(env, token);

    // Assert
    expect(result).toEqual({ ok: false, status: 403, error: 'access_denied' });
  });

  it('rejects a token with no email claim with 403', async () => {
    // Arrange
    const keyPair = await generateAccessKeyPair();
    stubJwksFetch(keyPair.publicJwk);
    const payload = validPayload();
    delete (payload as { email?: string }).email;
    const token = await signToken(keyPair, payload);
    const env = stubEnv();

    // Act
    const result = await verifyAccessJwt(env, token);

    // Assert
    expect(result).toEqual({ ok: false, status: 403, error: 'access_denied' });
  });

  it('rejects a token with an empty-string email claim with 403', async () => {
    // Arrange
    const keyPair = await generateAccessKeyPair();
    stubJwksFetch(keyPair.publicJwk);
    const token = await signToken(keyPair, validPayload({ email: '' }));
    const env = stubEnv();

    // Act
    const result = await verifyAccessJwt(env, token);

    // Assert
    expect(result).toEqual({ ok: false, status: 403, error: 'access_denied' });
  });

  it('falls back to email as the identity sub when the token has no sub claim', async () => {
    // Arrange
    const keyPair = await generateAccessKeyPair();
    stubJwksFetch(keyPair.publicJwk);
    const payload = validPayload();
    delete (payload as { sub?: string }).sub;
    const token = await signToken(keyPair, payload);
    const env = stubEnv();

    // Act
    const result = await verifyAccessJwt(env, token);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.sub).toBe('admin@airlens.cloud');
    }
  });

  describe('ACCESS_ALLOWED_EMAILS gate (S1)', () => {
    it('accepts a verified token whose email is in the allowlist', async () => {
      // Arrange
      const keyPair = await generateAccessKeyPair();
      stubJwksFetch(keyPair.publicJwk);
      const token = await signToken(keyPair, validPayload({ email: 'admin@airlens.cloud' }));
      const env = stubEnv({ ACCESS_ALLOWED_EMAILS: 'someone-else@airlens.cloud, Admin@AirLens.Cloud ' });

      // Act
      const result = await verifyAccessJwt(env, token);

      // Assert — allowlist entries are trimmed and matched case-insensitively.
      expect(result.ok).toBe(true);
    });

    it('rejects a verified token whose email is absent from the allowlist with 403', async () => {
      // Arrange
      const keyPair = await generateAccessKeyPair();
      stubJwksFetch(keyPair.publicJwk);
      const token = await signToken(keyPair, validPayload({ email: 'not-an-admin@airlens.cloud' }));
      const env = stubEnv({ ACCESS_ALLOWED_EMAILS: 'admin@airlens.cloud' });

      // Act
      const result = await verifyAccessJwt(env, token);

      // Assert
      expect(result).toEqual({ ok: false, status: 403, error: 'access_denied' });
    });

    it('returns 503 access_not_configured when ACCESS_ALLOWED_EMAILS is unset, even for an otherwise-valid token', async () => {
      // Arrange
      const keyPair = await generateAccessKeyPair();
      stubJwksFetch(keyPair.publicJwk);
      const token = await signToken(keyPair, validPayload());
      const env = stubEnv({ ACCESS_ALLOWED_EMAILS: undefined });

      // Act
      const result = await verifyAccessJwt(env, token);

      // Assert
      expect(result).toEqual({ ok: false, status: 503, error: 'access_not_configured' });
    });

    it('returns 503 access_not_configured when ACCESS_ALLOWED_EMAILS is an empty/blank string', async () => {
      // Arrange
      const keyPair = await generateAccessKeyPair();
      stubJwksFetch(keyPair.publicJwk);
      const token = await signToken(keyPair, validPayload());
      const env = stubEnv({ ACCESS_ALLOWED_EMAILS: '  , ,' });

      // Act
      const result = await verifyAccessJwt(env, token);

      // Assert
      expect(result).toEqual({ ok: false, status: 503, error: 'access_not_configured' });
    });
  });
});

describe('authenticateAccessRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetAccessCacheForTests();
  });

  it('returns 401 access_jwt_missing when the header is absent (env configured)', async () => {
    // Arrange
    const env = stubEnv();
    const request = new Request('https://airlens.cloud/api/admin/observations');

    // Act
    const result = await authenticateAccessRequest(request, env);

    // Assert
    expect(result).toEqual({ ok: false, status: 401, error: 'access_jwt_missing' });
  });

  it('returns 503 before checking the header when Access env is unconfigured', async () => {
    // Arrange
    const env = stubEnv({ ACCESS_TEAM_DOMAIN: undefined, ACCESS_AUD: undefined });
    const request = new Request('https://airlens.cloud/api/admin/observations');

    // Act
    const result = await authenticateAccessRequest(request, env);

    // Assert
    expect(result).toEqual({ ok: false, status: 503, error: 'access_not_configured' });
  });

  it('verifies a valid header token end-to-end', async () => {
    // Arrange
    const keyPair = await generateAccessKeyPair();
    stubJwksFetch(keyPair.publicJwk);
    const token = await signToken(keyPair, validPayload());
    const env = stubEnv();
    const request = new Request('https://airlens.cloud/api/admin/observations', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    });

    // Act
    const result = await authenticateAccessRequest(request, env);

    // Assert
    expect(result.ok).toBe(true);
  });
});
