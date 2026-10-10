/**
 * airlens-api — Track 2 (Supabase → Cloudflare Workers + D1) application API.
 *
 * Phase 0 scaffold shipped the health endpoint. Phase 2 added the anonymous
 * submission pipeline: Turnstile siteverify → KV per-IP rate limit → D1
 * insert. Phase 3 (this revision) adds the admin/moderation endpoints,
 * gated by a Cloudflare Access JWT verified in-Worker.
 *
 * Route contract: this worker is meant to serve `airlens.cloud/api/*`
 * (same-origin with the Pages site — a Phase 3 Access-cookie prerequisite),
 * so every path it handles is written with the `/api/` prefix included.
 */

import { resolveCors } from './cors';
import { handleObservationSubmit, handleTrainingSampleSubmit } from './submissions';
import { handleAdminObservationModerate, handleAdminObservationsList } from './admin';
import { handleOpenMeteoProxy, type ProxyRoute } from './proxy';
import { handleGoogleAqProxy } from './googleAq';

export interface Env {
  /** D1 `airlens-db` — Track 2 migration target for runtime-write tables. */
  airlens_db: D1Database;
  /** Rate-limit counter store (same 3-layer pattern as public-api). */
  RL_KV?: KVNamespace;
  /** Cloudflare Turnstile secret key — `wrangler secret put TURNSTILE_SECRET_KEY`. */
  TURNSTILE_SECRET_KEY: string;
  /** HMAC key for the daily-rotating submitter hash — `wrangler secret put SUBMITTER_HASH_SECRET`. */
  SUBMITTER_HASH_SECRET: string;
  /** Comma-separated browser origin allowlist for CORS. */
  ALLOWED_ORIGINS: string;
  /** Per-IP per-minute submission cap (parsed as int). */
  OBS_RATE_PER_MIN: string;
  /** Per-IP per-day submission cap (parsed as int). */
  OBS_RATE_PER_DAY: string;
  /**
   * Cloudflare Access team subdomain (e.g. "myteam" for
   * myteam.cloudflareaccess.com). Unset until the Access app is created —
   * `/api/admin/*` fails closed with 503 while it's missing (dormant, same
   * pattern as ANON_SUBMISSIONS_ENABLED on the frontend).
   */
  ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access application AUD tag. Unset until the Access app is created (see ACCESS_TEAM_DOMAIN). */
  ACCESS_AUD?: string;
  /**
   * Comma-separated allowlist of admin emails (trimmed, case-insensitive) —
   * the second, in-code authorization gate behind the Access JWT itself
   * (see access.ts). Unset/empty is treated as not-configured (dormant),
   * same as ACCESS_TEAM_DOMAIN/ACCESS_AUD.
   */
  ACCESS_ALLOWED_EMAILS?: string;
  /**
   * Google Air Quality API key (`currentConditions:lookup`) — Today
   * "Instrument Sheet" PM2.5·GOOGLE cross-check cell (2026-08-26). Secret,
   * set via `wrangler secret put Google_AQ_API` (never a `[vars]` entry —
   * see wrangler.toml). Unset by default in test envs; `googleAq.ts` fails
   * closed with 503 `google_aq_not_configured` while it's missing, same
   * dormant-until-provisioned pattern as ACCESS_TEAM_DOMAIN above.
   */
  Google_AQ_API?: string;
}

interface HealthBody {
  status: 'ok';
  service: 'airlens-api';
  /** D1 connectivity probe result — 'ok' | 'error'; never fails the 200. */
  d1: string;
  kv: 'bound' | 'unbound';
}

export async function healthCheck(env: Env): Promise<Response> {
  let d1 = 'error';
  try {
    await env.airlens_db.prepare('SELECT 1').first();
    d1 = 'ok';
  } catch {
    // Health stays 200 — the probe result is reported, not fatal, so a
    // binding misconfiguration is visible without taking the endpoint down.
  }
  const body: HealthBody = {
    status: 'ok',
    service: 'airlens-api',
    d1,
    kv: env.RL_KV ? 'bound' : 'unbound',
  };
  return Response.json(body);
}

/** Merges CORS headers onto a response, leaving it untouched when there are none. */
function withCors(response: Response, corsHeaders: Record<string, string> | null): Response {
  if (!corsHeaders) {
    return response;
  }
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Every /api/admin/* response (success or error) is never cacheable — moderation queue contents and decisions are not shared/stale-able data. */
function withNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** CORS + no-store, applied uniformly to every response the /api/admin/* branch returns. */
function finishAdminResponse(response: Response, corsHeaders: Record<string, string> | null): Response {
  return withNoStore(withCors(response, corsHeaders));
}

export async function handleRequest(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');

  if (request.method === 'GET' && url.pathname === '/api/health') {
    return healthCheck(env);
  }

  // Open-Meteo passthrough (D2 — replaces the retired Supabase data-proxy
  // Edge Function's weather/AQ handlers). Read-only, keyless, no Access/CSRF
  // concerns like the admin routes below — routing here only resolves CORS
  // and dispatches; proxy.ts owns rate limiting, caching, and the upstream
  // call.
  const proxyRouteByPath: Record<string, ProxyRoute> = {
    '/api/proxy/open-meteo-weather': 'open-meteo-weather',
    '/api/proxy/open-meteo-aq': 'open-meteo-aq',
  };
  const proxyRoute = proxyRouteByPath[url.pathname];
  if (proxyRoute) {
    const cors = resolveCors(env, origin);
    if (origin && !cors) {
      return Response.json({ error: 'origin_forbidden' }, { status: 403 });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors ?? undefined });
    }
    if (request.method !== 'GET') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: cors ?? undefined });
    }
    return handleOpenMeteoProxy(proxyRoute, request, env, ctx, cors);
  }

  // Google AQ passthrough (2026-08-26, Today "Instrument Sheet"). Separate
  // branch from the open-meteo dispatcher above — this route calls a keyed
  // upstream with its own POST-body translation and response shaping
  // (googleAq.ts), not a same-shape GET passthrough like ProxyRoute's two
  // entries, so it doesn't fit the proxyRouteByPath table. CORS/method
  // handling stays symmetric with the open-meteo branch above.
  if (url.pathname === '/api/proxy/google-aq') {
    const cors = resolveCors(env, origin);
    if (origin && !cors) {
      return Response.json({ error: 'origin_forbidden' }, { status: 403 });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors ?? undefined });
    }
    if (request.method !== 'GET') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: cors ?? undefined });
    }
    return handleGoogleAqProxy(request, env, ctx, cors);
  }

  const isSubmissionRoute = url.pathname === '/api/observations' || url.pathname === '/api/training-samples';
  const isAdminObservationsList = url.pathname === '/api/admin/observations';
  const isAdminObservationsModerate = url.pathname === '/api/admin/observations/moderate';
  const isAdminRoute = isAdminObservationsList || isAdminObservationsModerate;

  if (request.method === 'OPTIONS' && (isSubmissionRoute || isAdminRoute)) {
    const cors = resolveCors(env, origin);
    if (!cors) {
      return Response.json({ error: 'origin_forbidden' }, { status: 403 });
    }
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method === 'POST' && isSubmissionRoute) {
    // A browser Origin outside the allowlist is rejected outright; a missing
    // Origin (curl, server-to-server) is not a CORS concern — Turnstile
    // inside the handler is the actual abuse gate for those.
    const cors = resolveCors(env, origin);
    if (origin && !cors) {
      return Response.json({ error: 'origin_forbidden' }, { status: 403 });
    }
    const response =
      url.pathname === '/api/observations'
        ? await handleObservationSubmit(request, env)
        : await handleTrainingSampleSubmit(request, env);
    return withCors(response, cors);
  }

  if (isAdminRoute) {
    // Same-origin is the deployment contract (Cloudflare Access cookies are
    // same-origin only — see wrangler.toml), but this stays symmetric with
    // the submission routes' CORS handling rather than special-casing admin.
    const cors = resolveCors(env, origin);
    if (origin && !cors) {
      return finishAdminResponse(Response.json({ error: 'origin_forbidden' }, { status: 403 }), cors);
    }

    // CSRF hardening for state-changing admin requests (everything but the
    // GET list route). The Supabase original relied on a Bearer auth header,
    // which browsers never attach to a cross-site form/fetch without an
    // explicit opt-in — that structural immunity doesn't exist here (Access
    // rides on a same-origin cookie a browser attaches automatically), so
    // it's rebuilt explicitly:
    //  1. `Sec-Fetch-Site` (browser-set, unspoofable from script) must be
    //     'same-origin' when present at all.
    //  2. `Origin` must be present — a cross-site request can omit it in
    //     some legacy paths, so "missing" is treated as suspicious here
    //     (unlike the submission routes, this surface has no anonymous/curl
    //     use case to protect).
    //  3. `Content-Type: application/json` is required, which forces a
    //     CORS preflight on any cross-origin attempt (a `Content-Type` a
    //     browser will send preflight-free — form-urlencoded, multipart,
    //     text/plain — is refused), restoring the preflight gate the
    //     original's custom Authorization header provided for free.
    if (request.method !== 'GET') {
      const secFetchSite = request.headers.get('Sec-Fetch-Site');
      if (secFetchSite && secFetchSite !== 'same-origin') {
        return finishAdminResponse(Response.json({ error: 'cross_site_forbidden' }, { status: 403 }), cors);
      }
      if (!origin) {
        return finishAdminResponse(Response.json({ error: 'origin_required' }, { status: 403 }), cors);
      }
      const contentType = request.headers.get('Content-Type') ?? '';
      if (!contentType.toLowerCase().startsWith('application/json')) {
        return finishAdminResponse(Response.json({ error: 'unsupported_media_type' }, { status: 415 }), cors);
      }
    }

    let response: Response;
    if (request.method === 'GET' && isAdminObservationsList) {
      response = await handleAdminObservationsList(request, env);
    } else if (request.method === 'POST' && isAdminObservationsModerate) {
      response = await handleAdminObservationModerate(request, env);
    } else {
      response = Response.json({ error: 'not_found' }, { status: 404 });
    }
    return finishAdminResponse(response, cors);
  }

  return Response.json({ error: 'not_found' }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
