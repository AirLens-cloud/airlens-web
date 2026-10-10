import type { Env } from './index';

// Outlives the minute/day window it guards so a counter can't expire
// mid-window (same convention as workers/chatbot/src/quota.ts).
const MINUTE_TTL_SECONDS = 120;
const DAY_TTL_SECONDS = 90_000;

export type RateLimitKind = 'obs' | 'ts';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Normalizes an IPv6 address to its /64 prefix for the rate-limit key. ISPs
 * and privacy extensions commonly rotate the low 64 bits of an IPv6 address
 * per-request/session, so keying on the full address would let a client
 * bypass the per-IP limit just by requesting a new address within the same
 * /64. IPv4 addresses (no `:`) pass through unchanged.
 */
function normalizeIpForRateLimit(ip: string): string {
  return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;
}

/**
 * Per-IP, per-endpoint submission rate limit: a per-minute counter and a
 * per-day counter, both must pass. `kind` separates the KV key space per
 * endpoint (`'obs'` = observations, `'ts'` = training-samples) so the two
 * endpoints don't share a budget — they intentionally reuse the same
 * OBS_RATE_PER_MIN/DAY limit values, just counted independently. KV
 * binding/limit misconfiguration or a KV blip fails OPEN — Turnstile is the
 * primary abuse gate, this is a secondary throttle, and a KV outage must not
 * take submissions down. A rejected request does not increment either
 * counter (same convention as chatbot's checkDailyQuota).
 */
export async function checkSubmissionRateLimit(
  env: Env,
  ip: string,
  kind: RateLimitKind,
): Promise<RateLimitResult> {
  if (!env.RL_KV) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const perMinuteLimit = parseInt(env.OBS_RATE_PER_MIN, 10);
  const perDayLimit = parseInt(env.OBS_RATE_PER_DAY, 10);
  if (
    !Number.isFinite(perMinuteLimit) ||
    perMinuteLimit <= 0 ||
    !Number.isFinite(perDayLimit) ||
    perDayLimit <= 0
  ) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const now = new Date();
  const minute = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const keyIp = normalizeIpForRateLimit(ip);
  const minuteKey = `rate:${kind}:${keyIp}:${minute}`;
  const dayKey = `rate:${kind}:day:${keyIp}:${day}`;

  try {
    const [minuteRaw, dayRaw] = await Promise.all([env.RL_KV.get(minuteKey), env.RL_KV.get(dayKey)]);
    const minuteCount = minuteRaw ? parseInt(minuteRaw, 10) : 0;
    const dayCount = dayRaw ? parseInt(dayRaw, 10) : 0;

    if (minuteCount >= perMinuteLimit) {
      return { allowed: false, retryAfterSeconds: 60 - now.getUTCSeconds() };
    }
    if (dayCount >= perDayLimit) {
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((midnight.getTime() - now.getTime()) / 1000),
      };
    }

    await Promise.all([
      env.RL_KV.put(minuteKey, String(minuteCount + 1), { expirationTtl: MINUTE_TTL_SECONDS }),
      env.RL_KV.put(dayKey, String(dayCount + 1), { expirationTtl: DAY_TTL_SECONDS }),
    ]);

    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

// Fixed (no env-var override) — this guards an internal admin surface, not
// a public-abuse endpoint like checkSubmissionRateLimit, so there is no
// per-deployment tuning need. Separate `rl:admin:<surface>:` key prefixes
// keep this counter space distinct from the `rate:obs:`/`rate:ts:`
// submission ones, and from each other — observations (list + moderate)
// share a generous 60/min budget (mirrors moderate-observation's
// RATE_LIMIT_PER_MIN_PER_ADMIN), blog moderation gets its own 30/min budget
// (mirrors blog-moderate's `maxRequests: 30`) so a burst against one surface
// can't starve the other.
export type AdminRateLimitSurface = 'obs' | 'blog';

const ADMIN_RATE_LIMIT_PER_MIN: Record<AdminRateLimitSurface, number> = {
  obs: 60,
  blog: 30,
};
const ADMIN_MINUTE_TTL_SECONDS = 120;

/**
 * Per-admin (Cloudflare Access `sub`), per-surface rate limit for
 * `/api/admin/*`. Fails OPEN on a KV outage or unbound namespace, same
 * convention as `checkSubmissionRateLimit`: Access JWT verification is the
 * primary gate on this surface, this is a secondary throttle that must not
 * take moderation down on a KV blip.
 */
export async function checkAdminRateLimit(
  env: Env,
  sub: string,
  surface: AdminRateLimitSurface,
): Promise<RateLimitResult> {
  if (!env.RL_KV) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const now = new Date();
  const minute = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  const key = `rl:admin:${surface}:${sub}:${minute}`;
  const limit = ADMIN_RATE_LIMIT_PER_MIN[surface];

  try {
    const raw = await env.RL_KV.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= limit) {
      return { allowed: false, retryAfterSeconds: 60 - now.getUTCSeconds() };
    }
    await env.RL_KV.put(key, String(count + 1), { expirationTtl: ADMIN_MINUTE_TTL_SECONDS });
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

// Fixed (no env-var override) — same convention as checkAdminRateLimit. This
// guards the keyless Open-Meteo passthrough (proxy.ts, D2 — replaces the
// retired Supabase data-proxy Edge Function), a public read surface with no
// per-deployment tuning need of its own, so it gets its own budget rather
// than reusing OBS_RATE_PER_MIN/DAY (those name the submission-abuse budget
// specifically). 'weather'/'aq' get independent counters so a burst against
// one can't starve the other — same reasoning as obs/blog above.
export type ProxyRateLimitSurface = 'weather' | 'aq' | 'google-aq';

// 'google-aq' gets a tighter budget than the keyless Open-Meteo surfaces —
// it spends a metered Google API key per upstream call (unlike weather/aq's
// free CAMS passthrough), so a burst here has a real cost the others don't.
const PROXY_RATE_LIMIT_PER_MIN: Record<ProxyRateLimitSurface, number> = {
  weather: 30,
  aq: 30,
  'google-aq': 15,
};
const PROXY_MINUTE_TTL_SECONDS = 120;

/**
 * Per-IP, per-surface rate limit for `/api/proxy/*`. Fails OPEN on a KV
 * outage/unbound namespace AND on a missing CF-Connecting-IP (unlike
 * checkSubmissionRateLimit's hard reject) — this is a read-only passthrough
 * with no forgeable side effect, so a request that can't be IP-keyed (local
 * `wrangler dev`, a test harness) degrades to "let it through" rather than
 * "reject outright".
 */
export async function checkProxyRateLimit(
  env: Env,
  ip: string,
  surface: ProxyRateLimitSurface,
): Promise<RateLimitResult> {
  if (!env.RL_KV || ip === 'unknown' || !ip) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const now = new Date();
  const minute = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  const key = `rl:proxy:${surface}:${ip}:${minute}`;
  const limit = PROXY_RATE_LIMIT_PER_MIN[surface];

  try {
    const raw = await env.RL_KV.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= limit) {
      return { allowed: false, retryAfterSeconds: 60 - now.getUTCSeconds() };
    }
    await env.RL_KV.put(key, String(count + 1), { expirationTtl: PROXY_MINUTE_TTL_SECONDS });
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
