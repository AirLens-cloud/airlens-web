import type { Env } from './index';

// JWKS is cached for an hour so every admin request doesn't refetch it — a
// key rotation still resolves within one request via the kid-miss refetch
// below, it just costs one extra round trip on the request that hits it.
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
// exp/nbf comparisons tolerate this much clock skew between this Worker and
// the Access token issuer, same convention as most JWT verifiers.
const CLOCK_SKEW_LEEWAY_SECONDS = 60;
// Minimum spacing between forced JWKS refetches triggered by a kid miss
// (see getJwks below) — `kid` comes from the JWT header, read before the
// signature is verified, so it's attacker-controlled.
const JWKS_FORCE_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decodes a base64url string to raw bytes. Hand-rolled (no atob/btoa
 * dependency — those decode standard base64, not base64url, and pulling in
 * a base64 library is off the table under the no-new-deps constraint) so it
 * works identically under `wrangler dev`/production and the vitest `node`
 * environment used by this package's tests.
 */
function base64UrlDecode(input: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bitsCollected = 0;

  for (const char of input) {
    if (char === '=') {
      break;
    }
    const normalized = char === '-' ? '+' : char === '_' ? '/' : char;
    const value = BASE64_CHARS.indexOf(normalized);
    if (value === -1) {
      throw new Error('invalid_base64url');
    }
    buffer = (buffer << 6) | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes.push((buffer >> bitsCollected) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function decodeJwtSegment<T>(segment: string): T {
  const bytes = base64UrlDecode(segment);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

/**
 * Truncates and strips newlines from an attacker-controlled string before
 * it reaches a log line. The JWT header's `alg`/`kid` are read before the
 * signature is verified, so an attacker can put anything there — this stops
 * both log injection (embedded `\r`/`\n` forging extra log lines) and
 * unbounded log growth from an oversized value.
 */
function sanitizeForLog(value: unknown): string {
  return String(value).slice(0, 64).replace(/[\r\n]/g, '');
}

interface AccessJwtHeader {
  alg?: string;
  kid?: string;
}

interface AccessJwtPayload {
  email?: string;
  sub?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
}

interface AccessJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

interface AccessJwks {
  keys: AccessJwk[];
}

export interface AccessIdentity {
  /** Cloudflare Access identity email — written to moderation_queue.actor. */
  email: string;
  /** Stable per-identity subject, used as the admin rate-limit key. */
  sub: string;
}

export type AccessAuthResult =
  | { ok: true; identity: AccessIdentity }
  | { ok: false; status: 401 | 403 | 503; error: string };

interface JwksCacheEntry {
  teamDomain: string;
  fetchedAt: number;
  jwks: AccessJwks;
}

// Module-level cache — persists across requests within the same isolate,
// reset (harmlessly) on a cold start.
let jwksCache: JwksCacheEntry | null = null;
// Timestamp of the last kid-miss-triggered forced refetch (see getJwks) —
// separate from jwksCache.fetchedAt, which tracks the normal TTL cache.
let lastForceRefreshAt = 0;

async function fetchJwks(teamDomain: string): Promise<AccessJwks> {
  const response = await fetch(`https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!response.ok) {
    throw new Error(`jwks_fetch_failed_${response.status}`);
  }
  return (await response.json()) as AccessJwks;
}

async function getJwks(teamDomain: string, forceRefresh: boolean): Promise<AccessJwks> {
  const now = Date.now();
  const cacheFresh =
    jwksCache !== null && jwksCache.teamDomain === teamDomain && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS;

  if (!forceRefresh && cacheFresh) {
    return (jwksCache as JwksCacheEntry).jwks;
  }

  if (forceRefresh && cacheFresh && now - lastForceRefreshAt < JWKS_FORCE_REFRESH_MIN_INTERVAL_MS) {
    // Throttled: without this, a flood of unauthenticated requests each
    // carrying a distinct bogus `kid` would force one outbound JWKS fetch
    // per request (kid is read from the header before the signature is
    // verified, so it's fully attacker-controlled). Trade-off: right after
    // a genuine Access key rotation, a request referencing the brand-new
    // key can 403 for up to this interval before a fresh fetch picks it up
    // — acceptable because Cloudflare Access rotates keys on a ~6-week
    // cycle and keeps the old key live alongside the new one during
    // rollover, so there is no all-requests-fail window, just a bounded
    // delay for the newest key.
    return (jwksCache as JwksCacheEntry).jwks;
  }

  const jwks = await fetchJwks(teamDomain);
  jwksCache = { teamDomain, fetchedAt: now, jwks };
  if (forceRefresh) {
    lastForceRefreshAt = now;
  }
  return jwks;
}

/** Test-only: clears the module-level JWKS cache and refresh throttle state so tests are order-independent. */
export function resetAccessCacheForTests(): void {
  jwksCache = null;
  lastForceRefreshAt = 0;
}

/**
 * Verifies a `Cf-Access-Jwt-Assertion` token against the team's JWKS
 * (RS256, WebCrypto — no jose/jsonwebtoken dependency), then checks the
 * verified email against `ACCESS_ALLOWED_EMAILS`. Every failure past "the
 * env isn't configured yet" collapses to a generic 403: the specific reason
 * (bad signature, expired, wrong issuer/audience, kid not found, email not
 * allowlisted) is logged server-side only, never handed to the caller.
 */
export async function verifyAccessJwt(env: Env, token: string): Promise<AccessAuthResult> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!teamDomain || !aud) {
    return { ok: false, status: 503, error: 'access_not_configured' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    console.warn('verifyAccessJwt: malformed token (expected 3 segments)');
    return { ok: false, status: 403, error: 'access_denied' };
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts;

  let header: AccessJwtHeader;
  let payload: AccessJwtPayload;
  try {
    header = decodeJwtSegment<AccessJwtHeader>(headerSegment);
    payload = decodeJwtSegment<AccessJwtPayload>(payloadSegment);
  } catch {
    console.warn('verifyAccessJwt: header/payload decode failed');
    return { ok: false, status: 403, error: 'access_denied' };
  }

  if (header.alg !== 'RS256' || !header.kid) {
    console.warn('verifyAccessJwt: unexpected alg/kid', sanitizeForLog(header.alg), sanitizeForLog(header.kid));
    return { ok: false, status: 403, error: 'access_denied' };
  }

  let jwks: AccessJwks;
  try {
    jwks = await getJwks(teamDomain, false);
  } catch (err) {
    console.warn('verifyAccessJwt: JWKS fetch failed', err instanceof Error ? err.message : err);
    return { ok: false, status: 403, error: 'access_denied' };
  }

  let jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // kid miss — refetch once (rate-limited, see getJwks) in case the team
    // rotated keys since our cache was populated, then give up (403) rather
    // than retrying indefinitely.
    try {
      jwks = await getJwks(teamDomain, true);
    } catch (err) {
      console.warn('verifyAccessJwt: JWKS refetch failed', err instanceof Error ? err.message : err);
      return { ok: false, status: 403, error: 'access_denied' };
    }
    jwk = jwks.keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) {
    console.warn('verifyAccessJwt: kid not found in JWKS', sanitizeForLog(header.kid));
    return { ok: false, status: 403, error: 'access_denied' };
  }

  let publicKey: CryptoKey;
  try {
    publicKey = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch (err) {
    console.warn('verifyAccessJwt: JWK import failed', err instanceof Error ? err.message : err);
    return { ok: false, status: 403, error: 'access_denied' };
  }

  const signedData = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
  let signatureValid: boolean;
  try {
    signatureValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      base64UrlDecode(signatureSegment),
      signedData,
    );
  } catch (err) {
    console.warn('verifyAccessJwt: signature verify threw', err instanceof Error ? err.message : err);
    signatureValid = false;
  }
  if (!signatureValid) {
    console.warn('verifyAccessJwt: signature verification failed');
    return { ok: false, status: 403, error: 'access_denied' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || now > payload.exp + CLOCK_SKEW_LEEWAY_SECONDS) {
    console.warn('verifyAccessJwt: token expired');
    return { ok: false, status: 403, error: 'access_denied' };
  }
  if (typeof payload.nbf === 'number' && now < payload.nbf - CLOCK_SKEW_LEEWAY_SECONDS) {
    console.warn('verifyAccessJwt: token not yet valid');
    return { ok: false, status: 403, error: 'access_denied' };
  }

  const expectedIss = `https://${teamDomain}.cloudflareaccess.com`;
  if (payload.iss !== expectedIss) {
    console.warn('verifyAccessJwt: issuer mismatch');
    return { ok: false, status: 403, error: 'access_denied' };
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes(aud)) {
    console.warn('verifyAccessJwt: audience mismatch');
    return { ok: false, status: 403, error: 'access_denied' };
  }

  if (typeof payload.email !== 'string' || payload.email.length === 0) {
    console.warn('verifyAccessJwt: token missing email claim');
    return { ok: false, status: 403, error: 'access_denied' };
  }

  // Second, independent authorization gate: a verified Access token proves
  // *who* the caller is, not that they should reach this admin surface — an
  // Access application policy misconfigured too broadly (e.g. "any
  // identity provider account") would otherwise let anyone with a valid
  // team login moderate content. This mirrors the Supabase original's
  // requireAdmin re-checking profiles.role rather than trusting the JWT
  // alone. Unset/empty allowlist is treated as "not configured" (dormant),
  // same contract as ACCESS_TEAM_DOMAIN/ACCESS_AUD above — Access being
  // wired up is not enough on its own to open this surface.
  const allowedEmails = (env.ACCESS_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowedEmails.length === 0) {
    return { ok: false, status: 503, error: 'access_not_configured' };
  }
  if (!allowedEmails.includes(payload.email.toLowerCase())) {
    console.warn('verifyAccessJwt: email not in ACCESS_ALLOWED_EMAILS allowlist');
    return { ok: false, status: 403, error: 'access_denied' };
  }

  return {
    ok: true,
    identity: { email: payload.email, sub: typeof payload.sub === 'string' && payload.sub ? payload.sub : payload.email },
  };
}

/**
 * Entry point for the `/api/admin/*` gate: reads the `Cf-Access-Jwt-Assertion`
 * header (set by Cloudflare Access on the protected route) and verifies it.
 * `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` unset (Access app not created yet) is
 * checked first so a dormant deploy always fails closed with 503, never a
 * misleading 401.
 */
export async function authenticateAccessRequest(request: Request, env: Env): Promise<AccessAuthResult> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return { ok: false, status: 503, error: 'access_not_configured' };
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) {
    return { ok: false, status: 401, error: 'access_jwt_missing' };
  }
  return verifyAccessJwt(env, token);
}
