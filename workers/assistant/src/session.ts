import type { Env } from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padLength = (4 - (str.length % 4)) % 4;
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export interface SessionPayload {
  sid: string;
  iat: number;
  exp: number;
}

/**
 * Issues a session token: `<base64url(payload json)>.<base64url(hmac sig)>`.
 * Not a JWT (no header segment / alg negotiation needed for a single
 * first-party HMAC secret) — deliberately the smallest thing that is still
 * tamper-evident and self-expiring.
 */
export async function issueSessionToken(
  env: Env,
  ttlSeconds: number,
): Promise<{ token: string; payload: SessionPayload }> {
  if (!env.SESSION_HMAC_SECRET) {
    throw new Error('SESSION_HMAC_SECRET is not configured');
  }
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { sid: crypto.randomUUID(), iat: now, exp: now + ttlSeconds };
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const key = await importHmacKey(env.SESSION_HMAC_SECRET);
  const signature = await crypto.subtle.sign('HMAC', key, payloadBytes);
  const token = `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
  return { token, payload };
}

/** Verifies signature + expiry. Returns null (never throws) on any failure —
 *  callers treat "no session" and "bad session" identically. */
export async function verifySessionToken(env: Env, token: string | undefined | null): Promise<SessionPayload | null> {
  if (!env.SESSION_HMAC_SECRET || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  try {
    const [payloadPart, sigPart] = parts;
    const payloadBytes = base64UrlDecode(payloadPart);
    const sigBytes = base64UrlDecode(sigPart);
    const key = await importHmacKey(env.SESSION_HMAC_SECRET);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, payloadBytes);
    if (!valid) return null;

    const payload = JSON.parse(decoder.decode(payloadBytes)) as Partial<SessionPayload>;
    if (typeof payload.sid !== 'string' || typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export interface TurnstileResult {
  ok: boolean;
  /** True when TURNSTILE_SECRET is unset and verification was skipped. */
  devBypass: boolean;
}

/**
 * Verifies a Turnstile response token via Cloudflare siteverify. With
 * TURNSTILE_SECRET unset (local/dev — no secret has been provisioned yet),
 * verification is skipped and a session is issued anyway: the loud
 * console.warn on every call is the guard against this ever being mistaken
 * for a verified production session (this worker must not be deployed to a
 * real origin with the secret unset).
 */
export async function verifyTurnstile(
  env: Env,
  turnstileToken: string | undefined,
  remoteIp: string,
): Promise<TurnstileResult> {
  if (!env.TURNSTILE_SECRET) {
    console.warn(
      '[assistant] TURNSTILE_SECRET not set — issuing dev-bypass session (Turnstile verification skipped). ' +
        'Do NOT deploy this worker to a real origin without TURNSTILE_SECRET.',
    );
    return { ok: true, devBypass: true };
  }

  if (!turnstileToken) {
    return { ok: false, devBypass: false };
  }

  try {
    const form = new URLSearchParams();
    form.set('secret', env.TURNSTILE_SECRET);
    form.set('response', turnstileToken);
    if (remoteIp) form.set('remoteip', remoteIp);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!res.ok) return { ok: false, devBypass: false };
    const body = (await res.json()) as { success?: boolean };
    return { ok: body.success === true, devBypass: false };
  } catch {
    return { ok: false, devBypass: false };
  }
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Quota key resolution — design §1 D-2: session hash (primary) with an IP
 * fallback (secondary) for requests that have no valid session. Hashed
 * rather than using the raw `sid` so a leaked KV key namespace does not
 * double as a session-token oracle.
 */
export async function resolveIdentifier(sid: string | null, ip: string): Promise<string> {
  if (sid) return `s:${await sha256Base64Url(sid)}`;
  return `ip:${ip || 'unknown'}`;
}
