import type { Env } from './index';

/**
 * Resolves the CORS response headers for a request Origin against
 * `env.ALLOWED_ORIGINS` (a comma-separated allowlist). Returns null when the
 * origin is absent or not on the allowlist — the caller decides what that
 * means (browser requests always send Origin; a missing header is a
 * same-origin or non-browser client, e.g. curl, which CORS does not gate —
 * Turnstile is the actual abuse gate for those).
 */
export function resolveCors(env: Env, origin: string | null): Record<string, string> | null {
  if (!origin) {
    return null;
  }
  const allowed = env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) {
    return null;
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}
