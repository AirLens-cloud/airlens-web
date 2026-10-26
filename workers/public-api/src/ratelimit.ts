/**
 * ratelimit.ts — per-IP rate limit (the middle of three layers).
 *
 * Defense in depth for a keyless public API:
 *   1. Edge cache — every GET sets `s-maxage`, so most traffic is served from
 *      the Cloudflare cache without ever running this limiter.
 *   2. This per-IP limit — Cloudflare's native Rate Limiting binding
 *      (`IP_RATE_LIMIT`, wrangler.toml `[[ratelimits]]`); 429 past the budget.
 *   3. A Cloudflare Rate Limiting Rule (dashboard, 1 rule) as the outer wall
 *      for volumetric abuse — recommended ~600 req/min/IP so it only trips on
 *      abuse well above this limiter's budget. Documented, not code.
 *
 * The binding is approximate by design: it counts per Cloudflare location and
 * syncs in the background, so a burst can overshoot the budget and a client
 * spread across locations gets a budget in each. It answers allow/deny only —
 * no remaining count and no reset time — which is why the result carries
 * neither.
 *
 * Fail-open: if the binding is unbound (dev/test), the request has no client
 * IP, or `limit()` throws, the request is allowed rather than blocking all
 * traffic — the edge cache and the CF rule still stand. A thrown call is
 * logged so a limiter outage shows up in the Worker's logs, and a missing
 * binding is logged once per isolate (see below).
 */

import type { Env } from './types';

// An unbound limiter is normal in unit tests, but on a deployed Worker it means
// the per-IP limit is silently off (a dropped or renamed `[[ratelimits]]`
// block) — so say so, once per isolate rather than once per request.
let warnedUnbound = false;

export interface RateLimitResult {
  allowed: boolean;
  /** Per-window budget, for the RateLimit-Limit header. */
  limit: number;
  /** Seconds a limited client should wait (Retry-After). The binding reports no
   *  reset time, so this is the whole window — an upper bound. */
  retryAfterSeconds: number;
}

export async function checkRateLimit(env: Env, ip: string): Promise<RateLimitResult> {
  const limit = Math.max(1, Number(env.RATE_LIMIT_MAX) || 120);
  const windowSeconds = Math.max(1, Number(env.RATE_LIMIT_WINDOW_SECONDS) || 60);
  const allow: RateLimitResult = { allowed: true, limit, retryAfterSeconds: windowSeconds };

  // Fail open when there is nothing to count with.
  if (!env.IP_RATE_LIMIT) {
    if (!warnedUnbound) {
      warnedUnbound = true;
      console.warn('[public-api] IP_RATE_LIMIT binding is missing — the per-IP rate limit is off');
    }
    return allow;
  }
  // An empty IP is skipped too: as a key it would put every client without an
  // IP into one shared bucket.
  if (!ip) return allow;

  try {
    const { success } = await env.IP_RATE_LIMIT.limit({ key: ip });
    return success ? allow : { ...allow, allowed: false };
  } catch (err) {
    // Never let a limiter hiccup take the API down.
    console.warn(
      '[public-api] rate limiter unavailable, failing open:',
      err instanceof Error ? err.message : err,
    );
    return allow;
  }
}

/** Client IP from Cloudflare's connecting-IP header (spoof-resistant at the edge). */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('CF-Connecting-IP') ??
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    ''
  );
}
