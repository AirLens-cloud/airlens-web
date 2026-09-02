import type { Env } from './types';

export function getAllowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildCorsHeaders(env: Env, origin: string): Record<string, string> {
  const allowed = getAllowedOrigins(env);
  const matchedOrigin = origin && allowed.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': matchedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** Client IP from Cloudflare's connecting-IP header (spoof-resistant at the edge). */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('CF-Connecting-IP') ??
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    ''
  );
}
