// /api/geo — IP-approximate location for first-visit personalization.
//
// Cloudflare's edge already resolves an approximate lat/lon for every
// request (`request.cf.latitude`/`longitude` — strings, both nullable) —
// this route just hands that back to the browser instead of the client
// guessing or calling a third-party geo-IP service. `wrangler pages dev`'s
// local `cf` mock leaves every geo field empty, so `available:false` there
// is the expected local-dev response, not a bug (same shape a real request
// from an edge location Cloudflare can't place would get).
//
// `Cache-Control: no-store` is required, not decorative: this is a
// per-visitor answer (each request's `cf` reflects THAT request's source
// IP) — an edge or browser cache here would serve one visitor's
// approximate coordinates to the next. Nothing from `cf` is logged or
// persisted by this route; it is read from the request and returned once.

interface CfProperties {
  latitude?: string
  longitude?: string
  city?: string
  country?: string
  timezone?: string
}

interface Ctx {
  request: Request & { cf?: CfProperties }
}

export type GeoResponse =
  | { available: true; lat: number; lon: number; city: string | null; country: string | null; source: 'ip-approx' }
  | { available: false }

/** `cf.latitude`/`longitude` are strings when present, `undefined` when
 * Cloudflare couldn't resolve a location for this request (or the local
 * dev mock) — never trust an empty string as `0, 0`. */
function toCoord(value: string | undefined): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function jsonResponse(body: GeoResponse): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export const onRequestGet = (ctx: Ctx): Response => {
  const cf = ctx.request.cf
  const lat = toCoord(cf?.latitude)
  const lon = toCoord(cf?.longitude)
  if (lat === null || lon === null) return jsonResponse({ available: false })
  return jsonResponse({
    available: true,
    lat,
    lon,
    city: cf?.city ?? null,
    country: cf?.country ?? null,
    source: 'ip-approx',
  })
}
