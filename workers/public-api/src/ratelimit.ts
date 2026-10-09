/**
 * ratelimit.ts — per-IP fixed-window counter (the middle of three layers).
 *
 * Defense in depth for a keyless public API:
 *   1. Edge cache — every GET sets `s-maxage`, so most traffic is served from
 *      the Cloudflare cache without ever running this counter.
 *   2. This KV counter — per-IP fixed window, returns 429 past the budget.
 *   3. A Cloudflare Rate Limiting Rule (dashboard, 1 rule) as the outer wall
 *      for volumetric abuse — recommended ~600 req/min/IP so it only trips on
 *      abuse well above this counter's budget. Documented, not code.
 *
 * Fail-open: if RL_KV is unbound (dev/test, or before an operator provisions
 * the namespace) the counter is skipped rather than blocking all traffic —
 * the edge cache and CF rule still stand. A KV read/write error also fails open.
 */

import type { Env } from './types';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets (for Retry-After). */
  resetSeconds: number;
}

export async function checkRateLimit(env: Env, ip: string): Promise<RateLimitResult> {
  const limit = Math.max(1, Number(env.RATE_LIMIT_MAX) || 120);
  const windowSeconds = Math.max(1, Number(env.RATE_LIMIT_WINDOW_SECONDS) || 60);

  // Fail open when the store is absent.
  if (!env.RL_KV || !ip) {
    return { allowed: true, limit, remaining: limit, resetSeconds: windowSeconds };
  }

  // Fixed window keyed by IP + window index so keys self-expire. Read the
  // clock once so the window index and the reset hint can't straddle a
  // window boundary across the KV await.
  const nowSec = Math.floor(Date.now() / 1000);
  const windowIndex = Math.floor(nowSec / windowSeconds);
  const key = `rl:${ip}:${windowIndex}`;

  try {
    // Note: KV has no atomic increment and is eventually consistent, so
    // concurrent requests can under-count and let a small burst through. This
    // is layer 2 of 3 by design — the Cloudflare Rate Limiting Rule (layer 3)
    // is the precise volumetric wall; this counter is the cheap common case.
    const current = Number((await env.RL_KV.get(key)) ?? '0');
    const next = current + 1;
    // TTL a little past the window so the key is gone before it can be reused.
    await env.RL_KV.put(key, String(next), { expirationTtl: windowSeconds + 5 });

    const remaining = Math.max(0, limit - next);
    return {
      allowed: next <= limit,
      limit,
      remaining,
      resetSeconds: windowSeconds - (nowSec % windowSeconds),
    };
  } catch {
    // Never let a KV hiccup take the API down.
    return { allowed: true, limit, remaining: limit, resetSeconds: windowSeconds };
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
