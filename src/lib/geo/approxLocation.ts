/**
 * approxLocation — client fetch for the IP-approximate location the edge
 * resolves per-request (`functions/api/geo.ts`).
 *
 * One network call per tab, deduped across concurrent callers (Home's hero
 * and `useGeolocation`/`useLocationPersonalization` can all mount around
 * the same time) via a module-level in-flight promise, and cached in
 * `sessionStorage` — deliberately NOT `localStorage`: a different network
 * (café wifi vs. home) resolves to a different approximate location, so
 * persisting the result past this browsing session would go stale in a way
 * a fresh IP lookup never does.
 *
 * `vite dev` has no Pages Functions at all — `/api/geo` falls through to
 * the SPA catch-all and comes back `text/html` (the same trap
 * `functions/data/[[path]].ts`'s header guard exists for on the data side).
 * That response is rejected here by content-type before any `.json()`
 * call, same defense-in-depth pattern `src/api/weather.ts`/
 * `src/api/gridSnapshot.ts` use for their own fallback fetches.
 *
 * Every failure path (network error, non-2xx, `text/html`, `available:false`
 * from the edge, malformed JSON) resolves to `null`, never throws — every
 * caller already has a real next fallback (Seoul / the feed's "thickest
 * air" pick), so a missed approximate location is never a hard error.
 */
const GEO_ENDPOINT = '/api/geo'
const SESSION_CACHE_KEY = 'airlens-approx-location'

export interface ApproxLocation {
  lat: number
  lon: number
  city: string | null
}

interface GeoApiResponse {
  available?: unknown
  lat?: unknown
  lon?: unknown
  city?: unknown
}

function isFiniteCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** `undefined` = nothing cached yet (never fetched this session). `null` =
 * cached "unavailable" (fetched once, no location). Anything else = a
 * cached hit. */
function readCache(): ApproxLocation | null | undefined {
  try {
    if (typeof window === 'undefined') return undefined
    const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY)
    if (raw === null) return undefined
    if (raw === 'null') return null
    const parsed = JSON.parse(raw) as Partial<ApproxLocation>
    if (!isFiniteCoord(parsed.lat) || !isFiniteCoord(parsed.lon)) return null
    return { lat: parsed.lat, lon: parsed.lon, city: typeof parsed.city === 'string' ? parsed.city : null }
  } catch {
    return undefined
  }
}

function writeCache(value: ApproxLocation | null): void {
  try {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(SESSION_CACHE_KEY, value === null ? 'null' : JSON.stringify(value))
  } catch {
    // Storage denied/unavailable — the in-flight dedupe below still covers this tab's life.
  }
}

async function fetchApprox(): Promise<ApproxLocation | null> {
  try {
    const res = await fetch(GEO_ENDPOINT)
    const contentType = res.headers?.get('content-type') ?? ''
    if (!res.ok || contentType.includes('text/html')) return null
    const body = (await res.json()) as GeoApiResponse
    if (body.available !== true || !isFiniteCoord(body.lat) || !isFiniteCoord(body.lon)) return null
    return { lat: body.lat, lon: body.lon, city: typeof body.city === 'string' ? body.city : null }
  } catch {
    return null
  }
}

let inFlight: Promise<ApproxLocation | null> | null = null

/** Resolves the visitor's IP-approximate location. Safe to call from many
 * components — the actual fetch happens at most once per tab session. */
export function getApproxLocation(): Promise<ApproxLocation | null> {
  const cached = readCache()
  if (cached !== undefined) return Promise.resolve(cached)
  if (inFlight) return inFlight
  inFlight = fetchApprox().then((result) => {
    writeCache(result)
    inFlight = null
    return result
  })
  return inFlight
}
