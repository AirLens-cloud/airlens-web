import type { Env } from './index';
import { checkProxyRateLimit, type ProxyRateLimitSurface } from './ratelimit';

/**
 * proxy.ts — `GET /api/proxy/open-meteo-weather` and `GET /api/proxy/open-meteo-aq`.
 *
 * Server-Collect replacement for the retired Supabase `data-proxy` Edge
 * Function's Open-Meteo handlers (Supabase 402'd + fully retired — see
 * `project_2026-08-20_supabase-402-storage-block.md`). Same upstream
 * contract as `apps/web/supabase/functions/data-proxy/handlers/open-meteo.ts`
 * (`handleOpenMeteoWeather` / `handleOpenMeteoAQ`): keyless upstream fetch,
 * hourly-array response passed through unmodified, 30-minute cache,
 * fail-loud on upstream error (never a silent 200 — public-repo.md
 * "Server-Collect" + Glass-box: an error must reach the client as an error).
 *
 * SSRF: the upstream URL is never built from user input. `route` selects one
 * of exactly two hardcoded URLs in ROUTES below — ALLOWED_UPSTREAM_HOSTS is a
 * belt-and-suspenders assertion against that hardcoded config, not a runtime
 * check on anything caller-controlled.
 */

export type ProxyRoute = 'open-meteo-weather' | 'open-meteo-aq';

interface RouteConfig {
  upstreamUrl: string;
  /** Open-Meteo `hourly` param — which series to request. */
  hourlyParams: string;
  rateLimitSurface: ProxyRateLimitSurface;
}

// Today "Instrument Sheet" (2026-08-26) — hourlyParams expanded past the D2
// migration baseline. Param names verified against Open-Meteo's own docs
// (WebFetch: open-meteo.com/en/docs [Forecast API] + open-meteo.com/en/docs/
// air-quality-api [Air Quality API], 2026-08-26 — not guessed):
//   weather: uv_index, apparent_temperature, precipitation_probability,
//     cloud_cover — all documented Forecast API `hourly` variables.
//   weather +wind_direction_10m (2026-08-26, airlens-web /weather W0 gate F1):
//     documented Forecast API variable, degrees. fieldsetTag in the cache key
//     already discriminates on the field list, so stale 8-field cache entries
//     can't be served against the 9-field contract.
//   aq: carbon_monoxide (CO instrument cell — the grid previously had no CO
//     source at all), dust ("Saharan dust particles… 10m above ground",
//     µg/m³), grass_pollen (European domain only, pollen season only — every
//     other region/month legitimately returns null, not a bug).
const ROUTES: Record<ProxyRoute, RouteConfig> = {
  'open-meteo-weather': {
    upstreamUrl: 'https://api.open-meteo.com/v1/forecast',
    hourlyParams:
      'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,apparent_temperature,precipitation_probability,cloud_cover,uv_index',
    rateLimitSurface: 'weather',
  },
  'open-meteo-aq': {
    upstreamUrl: 'https://air-quality-api.open-meteo.com/v1/air-quality',
    hourlyParams: 'pm2_5,pm10,ozone,nitrogen_dioxide,carbon_monoxide,dust,grass_pollen',
    rateLimitSurface: 'aq',
  },
};

const ALLOWED_UPSTREAM_HOSTS = new Set(['api.open-meteo.com', 'air-quality-api.open-meteo.com']);

/** Mirrors data-proxy's `OPEN_METEO_*_GRID_CACHE_TTL_MS` (30 min). */
const CACHE_TTL_SECONDS = 30 * 60;
/** Mirrors data-proxy's `AbortSignal.timeout(8000)` for these two routes. */
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_FORECAST_HOURS = 168;
const DEFAULT_FORECAST_HOURS = 24;

/** Shared with googleAq.ts — same fail-loud JSON error shape across every `/api/proxy/*` route. */
export function jsonError(status: number, body: Record<string, unknown>, extraHeaders?: HeadersInit): Response {
  return Response.json(body, { status, headers: extraHeaders });
}

interface ParsedQuery {
  lat: number;
  lon: number;
  hours: number;
}

/** `?lat=&lon=&hours=` — same fields the pre-migration `data-proxy` request body carried. */
function parseQuery(url: URL): ParsedQuery | null {
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

  const hoursRaw = url.searchParams.get('hours');
  let hours = DEFAULT_FORECAST_HOURS;
  if (hoursRaw !== null) {
    const parsed = Number(hoursRaw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    hours = Math.min(Math.floor(parsed), MAX_FORECAST_HOURS);
  }
  return { lat, lon, hours };
}

/**
 * Mirrors data-proxy's `OpenMeteoWeatherSchema`/`OpenMeteoAqSchema` shape
 * check (latitude/longitude in range + an optional `hourly` object) without
 * a schema library — this worker bans schema-library deps (see validate.ts).
 */
function isValidUpstreamShape(raw: unknown): raw is { hourly?: Record<string, unknown> } {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.latitude !== 'number' || r.latitude < -90 || r.latitude > 90) {
    return false;
  }
  if (typeof r.longitude !== 'number' || r.longitude < -180 || r.longitude > 180) {
    return false;
  }
  if (r.hourly !== undefined && (typeof r.hourly !== 'object' || r.hourly === null || Array.isArray(r.hourly))) {
    return false;
  }
  return true;
}

/**
 * Stable short digest of a route's requested field list. Cheap FNV-1a — this
 * is a cache-bust discriminator, not a security primitive.
 */
export function fieldsetTag(hourlyParams: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < hourlyParams.length; i += 1) {
    hash ^= hourlyParams.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Normalized cache key — lat/lon rounded to 2 decimals (~1.1km, well inside
 * Open-Meteo's own forecast grid resolution) so co-located clients within
 * the same 30-minute window share one cache entry instead of one each.
 *
 * `fields` discriminates on the requested `hourly` series (2026-08-26): the
 * Instrument Sheet expansion shipped new fields but every cached entry kept
 * answering with the pre-expansion field list, so the new instrument cells
 * read "unavailable" for the whole TTL — and the edge TTL is a zone setting
 * (observed max-age=14400), not this worker's 30 minutes. Keying on the
 * fieldset makes any future field change self-invalidating.
 */
function buildCacheKey(route: ProxyRoute, query: ParsedQuery): Request {
  const key = new URL(`https://airlens-proxy-cache.internal/${route}`);
  key.searchParams.set('lat', query.lat.toFixed(2));
  key.searchParams.set('lon', query.lon.toFixed(2));
  key.searchParams.set('hours', String(query.hours));
  key.searchParams.set('fields', fieldsetTag(ROUTES[route].hourlyParams));
  return new Request(key.toString(), { method: 'GET' });
}

async function fetchUpstream(route: ProxyRoute, query: ParsedQuery): Promise<Response> {
  const config = ROUTES[route];
  const upstreamHost = new URL(config.upstreamUrl).hostname;
  /* c8 ignore next 3 -- ROUTES is a hardcoded module constant; this branch
     can only fire from a future edit that breaks the invariant it guards. */
  if (!ALLOWED_UPSTREAM_HOSTS.has(upstreamHost)) {
    throw new Error(`upstream host not allowlisted: ${upstreamHost}`);
  }

  const params = new URLSearchParams({
    latitude: String(query.lat),
    longitude: String(query.lon),
    hourly: config.hourlyParams,
    forecast_hours: String(query.hours),
  });
  if (route === 'open-meteo-weather') {
    params.set('timezone', 'auto');
  }

  let res: Response;
  try {
    res = await fetch(`${config.upstreamUrl}?${params}`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch (e) {
    console.error(`proxy[${route}]: upstream unreachable`, e instanceof Error ? e.message : e);
    return jsonError(502, { error: 'upstream_unreachable' });
  }
  if (!res.ok) {
    console.error(`proxy[${route}]: upstream returned ${res.status}`);
    return jsonError(502, { error: 'upstream_error', upstream_status: res.status });
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    console.error(`proxy[${route}]: upstream response was not valid JSON`);
    return jsonError(502, { error: 'upstream_invalid_json' });
  }
  if (!isValidUpstreamShape(raw)) {
    console.error(`proxy[${route}]: upstream shape invalid`);
    return jsonError(502, { error: 'upstream_shape_invalid' });
  }

  return new Response(JSON.stringify(raw), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` },
  });
}

/** Shared with googleAq.ts — clone-and-set-headers helper (Response.headers is otherwise immutable once constructed). */
export function withHeaders(response: Response, extra: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(extra)) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * `cors` is pre-resolved by the caller (index.ts, via `resolveCors`) so this
 * module stays symmetric with submissions.ts/admin.ts: routing owns
 * CORS/origin decisions, handlers own the endpoint's own logic.
 */
export async function handleOpenMeteoProxy(
  route: ProxyRoute,
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
  const query = parseQuery(url);
  if (!query) {
    return attachCors(jsonError(400, { error: 'invalid_query' }));
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rateLimit = await checkProxyRateLimit(env, ip, ROUTES[route].rateLimitSurface);
  if (!rateLimit.allowed) {
    return attachCors(
      jsonError(429, { error: 'rate_limited', retry_after_seconds: rateLimit.retryAfterSeconds }, {
        'Retry-After': String(rateLimit.retryAfterSeconds),
      }),
    );
  }

  // Cloudflare Cache API — shared across isolates in the same datacenter,
  // unlike data-proxy's Edge Function `Map` (per-instance, lost on cold
  // start). Absent outside the Workers runtime (local vitest) — fails open
  // to "no cache", same fail-open convention as the KV rate limiter above.
  const cache = typeof caches !== 'undefined' ? caches.default : undefined;
  const cacheKey = buildCacheKey(route, query);
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return attachCors(cached, { 'X-Cache': 'HIT' });
    }
  }

  const response = await fetchUpstream(route, query);
  if (response.ok && cache) {
    const toCache = response.clone();
    if (ctx) {
      ctx.waitUntil(cache.put(cacheKey, toCache));
    } else {
      await cache.put(cacheKey, toCache);
    }
  }

  return attachCors(response, response.ok ? { 'X-Cache': 'MISS' } : undefined);
}
