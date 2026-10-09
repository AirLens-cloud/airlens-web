/**
 * airlens-public-api — keyless, read-only /v1 REST API + /mcp server over the
 * already-public AirLens static snapshots. No database, no secrets.
 *
 * Request flow:
 *   CORS preflight → rate limit (edge cache is the real first line) → route.
 * Every successful GET sets `Cache-Control: public, s-maxage=<ttl>` so the
 * Cloudflare edge absorbs repeat traffic; the KV per-IP counter (ratelimit.ts)
 * and a Cloudflare Rate Limiting Rule are layers 2 and 3.
 */

import type { Env } from './types';
import {
  handleGrid,
  handleHealth,
  handleOntologySummary,
  handlePredictions,
  handleCityPrediction,
  handleStations,
  type HandlerResult,
} from './handlers';
import { UpstreamError } from './upstream';
import { buildOpenApi } from './openapi';
import { handleMcpMessage } from './mcp';
import { checkRateLimit, getClientIp } from './ratelimit';

/** Max JSON-RPC messages in one /mcp batch (fan-out / rate-limit-evasion cap). */
const MAX_MCP_BATCH = 20;

function corsHeaders(env: Env, origin: string): Record<string, string> {
  const allow = (env.ALLOWED_ORIGINS || '*').trim();
  const list = allow.split(',').map((s) => s.trim());
  const allowOrigin = allow === '*' ? '*' : list.includes(origin) ? origin : list[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
  cacheTtl = 0,
): Response {
  const h: Record<string, string> = {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
  };
  h['Cache-Control'] =
    status === 200 && cacheTtl > 0 ? `public, s-maxage=${cacheTtl}` : 'no-store';
  return new Response(JSON.stringify(body), { status, headers: h });
}

function rest(result: HandlerResult, headers: Record<string, string>): Response {
  return json(result.data, 200, headers, result.cacheTtlSeconds);
}

function publicBaseUrl(req: Request): string {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') ?? '';
    const cors = corsHeaders(env, origin);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // ── Rate limit (layer 2) ──
    const rl = await checkRateLimit(env, getClientIp(req));
    const rlHeaders = {
      ...cors,
      'RateLimit-Limit': String(rl.limit),
      'RateLimit-Remaining': String(rl.remaining),
    };
    if (!rl.allowed) {
      return json(
        { error: 'rate_limited', message: 'Too many requests. Try again shortly.' },
        429,
        { ...rlHeaders, 'Retry-After': String(rl.resetSeconds) },
      );
    }

    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      // ── MCP (POST /mcp) ──
      if (path === '/mcp') {
        if (req.method === 'GET') {
          // Streamable-HTTP SSE stream: unused (this server never pushes).
          return json(
            { error: 'method_not_allowed', message: 'POST JSON-RPC messages to /mcp.' },
            405,
            rlHeaders,
          );
        }
        if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, rlHeaders);
        let msg: unknown;
        try {
          msg = await req.json();
        } catch {
          return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400, rlHeaders);
        }
        if (Array.isArray(msg)) {
          // One HTTP request = one rate-limit token, so an unbounded batch
          // would both evade the per-IP limiter and fan out expensive
          // snapshot fetches/scans. Cap the batch length.
          if (msg.length > MAX_MCP_BATCH) {
            return json(
              { jsonrpc: '2.0', id: null, error: { code: -32600, message: `batch too large (max ${MAX_MCP_BATCH})` } },
              413,
              rlHeaders,
            );
          }
          const out = (await Promise.all(msg.map((m) => handleMcpMessage(env, m)))).filter(Boolean);
          return json(out, 200, rlHeaders);
        }
        const reply = await handleMcpMessage(env, msg as Record<string, unknown>);
        if (reply === null) return new Response(null, { status: 202, headers: rlHeaders });
        return json(reply, 200, rlHeaders);
      }

      // ── REST is GET-only ──
      if (req.method !== 'GET') {
        return json({ error: 'method_not_allowed' }, 405, rlHeaders);
      }

      switch (true) {
        case path === '/' || path === '/v1':
          return json(
            {
              api: 'AirLens Public Data API',
              version: 'v1',
              docs: `${publicBaseUrl(req)}/v1/openapi.json`,
              endpoints: [
                '/v1/health',
                '/v1/grid/latest',
                '/v1/predictions/cities',
                '/v1/predictions/cities/{name}',
                '/v1/stations',
                '/v1/ontology/summary',
                '/mcp',
              ],
            },
            200,
            rlHeaders,
            3600,
          );

        case path === '/v1/health':
          return rest(handleHealth(), rlHeaders);

        case path === '/v1/openapi.json':
          return json(buildOpenApi(publicBaseUrl(req)), 200, rlHeaders, 3600);

        case path === '/v1/grid/latest':
          return rest(await handleGrid(env, url.searchParams.get('variable') ?? 'pm25'), rlHeaders);

        case path === '/v1/predictions/cities':
          return rest(await handlePredictions(env), rlHeaders);

        case path.startsWith('/v1/predictions/cities/'): {
          let name: string;
          try {
            name = decodeURIComponent(path.slice('/v1/predictions/cities/'.length));
          } catch {
            // Malformed percent-encoding is a client error, not a 500.
            return json({ error: 'bad_request', message: 'invalid city name encoding' }, 400, rlHeaders);
          }
          return rest(await handleCityPrediction(env, name), rlHeaders);
        }

        case path === '/v1/stations':
          return rest(await handleStations(env), rlHeaders);

        case path === '/v1/ontology/summary':
          return rest(handleOntologySummary(), rlHeaders);

        default:
          return json({ error: 'not_found', message: `no route for ${path}` }, 404, rlHeaders);
      }
    } catch (err) {
      if (err instanceof UpstreamError) {
        return json({ error: 'upstream', message: err.message }, err.status, rlHeaders);
      }
      return json({ error: 'internal', message: 'unexpected error' }, 500, rlHeaders);
    }
  },
};
