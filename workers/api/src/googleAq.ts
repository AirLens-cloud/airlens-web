import type { Env } from './index';
import { checkProxyRateLimit } from './ratelimit';
import { jsonError, withHeaders } from './proxy';

/**
 * googleAq.ts — `GET /api/proxy/google-aq?lat=&lon=`.
 *
 * Server-Collect proxy for the Google Air Quality API `currentConditions:lookup`
 * endpoint. Replaces the retired Supabase `data-proxy` Edge Function's on-demand
 * google-aq handler (`apps/web/supabase/functions/data-proxy/handlers/google-aq.ts`
 * — Supabase 402'd + fully retired, see
 * `project_2026-08-20_supabase-402-storage-block.md`). The old handler's
 * batch-snapshot DB lookup (`google_aq_snapshots` table, nearest-neighbor cache)
 * is NOT ported — D1 has no such table and reviving that persistence layer is a
 * separate backlog item. Every request here is a fresh upstream call, fronted
 * only by the same 30-minute Cache API layer proxy.ts uses.
 *
 * The API key (`env.Google_AQ_API` — Cloudflare Worker secret, set out-of-band
 * via `wrangler secret put Google_AQ_API`, never a `[vars]` entry in
 * wrangler.toml) is read server-side only. It is used solely to build the
 * upstream fetch URL and is never echoed into a response body or a log line —
 * `console.error` calls below log the upstream HTTP status or `Error#message`
 * only, never the request itself.
 *
 * SSRF: `GOOGLE_AQ_UPSTREAM_URL` is a hardcoded constant; `lat`/`lon` are
 * validated range-bound numbers that only ever populate the POST body, never
 * the URL/host.
 */

const GOOGLE_AQ_UPSTREAM_URL = 'https://airquality.googleapis.com/v1/currentConditions:lookup';
const UPSTREAM_TIMEOUT_MS = 10_000;
/** Same 30-minute convention as proxy.ts's CACHE_TTL_SECONDS. */
const CACHE_TTL_SECONDS = 30 * 60;

interface LatLon {
  lat: number;
  lon: number;
}

function parseLatLon(url: URL): LatLon | null {
  const latRaw = url.searchParams.get('lat');
  const lonRaw = url.searchParams.get('lon');
  if (latRaw === null || lonRaw === null) {
    return null;
  }
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return null;
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return null;
  }
  return { lat, lon };
}

/** Normalized cache key — same 2-decimal rounding convention as proxy.ts's buildCacheKey. */
function buildCacheKey(query: LatLon): Request {
  const key = new URL('https://airlens-proxy-cache.internal/google-aq');
  key.searchParams.set('lat', query.lat.toFixed(2));
  key.searchParams.set('lon', query.lon.toFixed(2));
  return new Request(key.toString(), { method: 'GET' });
}

interface GoogleAqIndex {
  code?: string;
  aqi?: number;
  displayName?: string;
  dominantPollutant?: string;
}

interface GoogleAqPollutant {
  code?: string;
  concentration?: { value?: number };
}

interface GoogleAqRawResponse {
  indexes?: GoogleAqIndex[];
  pollutants?: GoogleAqPollutant[];
  healthRecommendations?: Record<string, string>;
  regionCode?: string;
}

/**
 * Hand-rolled shape check (no schema library — see validate.ts's ban comment).
 * Deliberately permissive/passthrough-like (mirrors the retired handler's
 * `GoogleAqSchema` zod shape): every field is optional, arrays are checked
 * shallowly. A field the upstream omits maps to `null` downstream, never a
 * fabricated value.
 */
function isValidGoogleAqShape(raw: unknown): raw is GoogleAqRawResponse {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const r = raw as Record<string, unknown>;
  if (r.indexes !== undefined && !Array.isArray(r.indexes)) {
    return false;
  }
  if (r.pollutants !== undefined && !Array.isArray(r.pollutants)) {
    return false;
  }
  if (r.healthRecommendations !== undefined && (typeof r.healthRecommendations !== 'object' || r.healthRecommendations === null)) {
    return false;
  }
  return true;
}

/** Client-facing shape — matches `apps/web/src/types/air-quality.ts` GoogleAqSnapshot exactly. */
interface GoogleAqSnapshotBody {
  source: string;
  city: string;
  uaqi: number | null;
  localAqi: number | null;
  localAqiName: string | null;
  dominantPollutant: string | null;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  healthRecommendations: {
    generalPopulation: string | null;
    elderly: string | null;
    children: string | null;
    athletes: string | null;
  };
  fetchedAt: string;
  expiresAt: string;
}

/** Reduces the raw Google indexes/pollutants arrays to the flat client shape — same field mapping as the retired Edge Fn's on-demand path. */
function buildSnapshot(raw: GoogleAqRawResponse, query: LatLon, nowMs: number): GoogleAqSnapshotBody {
  const indexes = raw.indexes ?? [];
  const pollutants = raw.pollutants ?? [];
  const health = raw.healthRecommendations ?? {};
  const uaqiIdx = indexes.find((x) => x.code === 'uaqi');
  const localIdx = indexes.find((x) => x.code !== 'uaqi');
  const getPollutant = (code: string): number | null => {
    const value = pollutants.find((x) => x.code === code)?.concentration?.value;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  return {
    source: 'google-aq-ondemand',
    city: `${query.lat.toFixed(2)},${query.lon.toFixed(2)}`,
    uaqi: uaqiIdx?.aqi ?? null,
    localAqi: localIdx?.aqi ?? null,
    localAqiName: localIdx?.displayName ?? null,
    dominantPollutant: uaqiIdx?.dominantPollutant ?? localIdx?.dominantPollutant ?? null,
    pm25: getPollutant('pm25'),
    pm10: getPollutant('pm10'),
    o3: getPollutant('o3'),
    no2: getPollutant('no2'),
    so2: getPollutant('so2'),
    co: getPollutant('co'),
    healthRecommendations: {
      generalPopulation: health.generalPopulation ?? null,
      elderly: health.elderly ?? null,
      children: health.children ?? null,
      athletes: health.athletes ?? null,
    },
    fetchedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + CACHE_TTL_SECONDS * 1000).toISOString(),
  };
}

/**
 * `cors` is pre-resolved by the caller (index.ts), same convention as
 * handleOpenMeteoProxy — routing owns CORS/origin decisions, this module owns
 * the endpoint's own logic.
 */
export async function handleGoogleAqProxy(
  request: Request,
  env: Env,
  ctx: ExecutionContext | undefined,
  cors: Record<string, string> | null,
): Promise<Response> {
  const attachCors = (response: Response, extra?: Record<string, string>): Response => {
    const headers = { ...(cors ?? {}), ...(extra ?? {}) };
    return Object.keys(headers).length > 0 ? withHeaders(response, headers) : response;
  };

  const url = new URL(request.url);
  const query = parseLatLon(url);
  if (!query) {
    return attachCors(jsonError(400, { error: 'invalid_query' }));
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rateLimit = await checkProxyRateLimit(env, ip, 'google-aq');
  if (!rateLimit.allowed) {
    return attachCors(
      jsonError(429, { error: 'rate_limited', retry_after_seconds: rateLimit.retryAfterSeconds }, {
        'Retry-After': String(rateLimit.retryAfterSeconds),
      }),
    );
  }

  const cache = typeof caches !== 'undefined' ? caches.default : undefined;
  const cacheKey = buildCacheKey(query);
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return attachCors(cached, { 'X-Cache': 'HIT' });
    }
  }

  // Dormant-until-provisioned (same pattern as the admin.ts env bindings):
  // fails closed with 503, never a silent empty 200.
  const apiKey = env.Google_AQ_API;
  if (!apiKey) {
    return attachCors(jsonError(503, { error: 'google_aq_not_configured' }));
  }

  let res: Response;
  try {
    res = await fetch(`${GOOGLE_AQ_UPSTREAM_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: { latitude: query.lat, longitude: query.lon },
        extraComputations: [
          'DOMINANT_POLLUTANT_CONCENTRATION',
          'POLLUTANT_CONCENTRATION',
          'HEALTH_RECOMMENDATIONS',
          'LOCAL_AQI',
        ],
        languageCode: 'en',
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    console.error('proxy[google-aq]: upstream unreachable', e instanceof Error ? e.message : e);
    return attachCors(jsonError(502, { error: 'upstream_unreachable' }));
  }
  if (!res.ok) {
    console.error(`proxy[google-aq]: upstream returned ${res.status}`);
    return attachCors(jsonError(502, { error: 'upstream_error', upstream_status: res.status }));
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    console.error('proxy[google-aq]: upstream response was not valid JSON');
    return attachCors(jsonError(502, { error: 'upstream_invalid_json' }));
  }
  if (!isValidGoogleAqShape(raw)) {
    console.error('proxy[google-aq]: upstream shape invalid');
    return attachCors(jsonError(502, { error: 'upstream_shape_invalid' }));
  }

  const body = buildSnapshot(raw, query, Date.now());
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` },
  });

  if (cache) {
    const toCache = response.clone();
    if (ctx) {
      ctx.waitUntil(cache.put(cacheKey, toCache));
    } else {
      await cache.put(cacheKey, toCache);
    }
  }

  return attachCors(response, { 'X-Cache': 'MISS' });
}
