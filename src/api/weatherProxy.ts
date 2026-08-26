/**
 * Weather / air-quality proxy client — Weather page (Wave W1).
 *
 * Server-Collect: the browser never calls Open-Meteo directly. Both hourly
 * routes go through the Community API Worker (`COMMUNITY_API_BASE`),
 * keyless and cached upstream for 30 minutes. An unset base URL
 * (`COMMUNITY_API_BASE === ''`) is an honest "not configured" state — no
 * request is attempted, and the caller renders that as missing, not as a
 * network failure.
 *
 * `fetchWeatherGridMslp` is a separate best-effort lookup against the shared
 * `weather-grid` mirror (10 degree step, `src/lib/config/feeds.ts`) for the
 * Wind Minimap's (S5) sea-level-pressure reading — that grid has no bundled
 * static fallback in this repo yet, so a total miss returns null rather than
 * a fabricated pressure.
 */
import { COMMUNITY_API_BASE, HF_LIVE_BASE } from '../lib/config/dataSources'
import { feedPipeline } from '../lib/config/feeds'
import type {
  OpenMeteoAqHourly,
  OpenMeteoAqProxyResponse,
  OpenMeteoWeatherHourly,
  OpenMeteoWeatherProxyResponse,
} from '../types/forecast'

const FETCH_TIMEOUT_MS = 8000
const DEFAULT_HOURS = 24

async function fetchProxyHourly<T>(
  route: string,
  lat: number,
  lon: number,
  hours: number,
): Promise<T | null> {
  if (!COMMUNITY_API_BASE) return null
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), hours: String(hours) })
  try {
    const res = await fetch(`${COMMUNITY_API_BASE}${route}?${params}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** 24h (default) hourly weather series for one location, via the keyless proxy. */
export async function fetchWeatherHourly(
  lat: number,
  lon: number,
  hours: number = DEFAULT_HOURS,
): Promise<OpenMeteoWeatherHourly | null> {
  const body = await fetchProxyHourly<OpenMeteoWeatherProxyResponse>(
    '/api/proxy/open-meteo-weather',
    lat,
    lon,
    hours,
  )
  return body?.hourly ?? null
}

/** 24h (default) hourly PM2.5 series for one location, via the keyless proxy. */
export async function fetchAqHourly(
  lat: number,
  lon: number,
  hours: number = DEFAULT_HOURS,
): Promise<OpenMeteoAqHourly | null> {
  const body = await fetchProxyHourly<OpenMeteoAqProxyResponse>('/api/proxy/open-meteo-aq', lat, lon, hours)
  return body?.hourly ?? null
}

// ── weather-grid MSLP (nearest cell) — S5 sea-level pressure ────────────────

export interface WeatherGridMslp {
  mslp: number
  refTime: string | null
}

interface WeatherGridPointRaw {
  lat?: unknown
  lon?: unknown
  mslp?: unknown
}

interface WeatherGridArtifact {
  refTime?: unknown
  points?: unknown
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

async function fetchGridArtifact(url: string): Promise<WeatherGridArtifact | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null
    const body = (await res.json()) as unknown
    return body && typeof body === 'object' ? (body as WeatherGridArtifact) : null
  } catch {
    return null
  }
}

function nearestMslp(artifact: WeatherGridArtifact, lat: number, lon: number): WeatherGridMslp | null {
  if (!Array.isArray(artifact.points)) return null

  let best: { mslp: number } | null = null
  let bestDist = Infinity
  for (const raw of artifact.points) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as WeatherGridPointRaw
    const plat = p.lat
    const plon = p.lon
    const pmslp = p.mslp
    if (!isFiniteNumber(plat) || !isFiniteNumber(plon) || !isFiniteNumber(pmslp)) continue
    const dLat = plat - lat
    const dLon = plon - lon
    const dist = dLat * dLat + dLon * dLon
    if (dist < bestDist) {
      bestDist = dist
      best = { mslp: pmslp }
    }
  }
  if (!best) return null
  return {
    mslp: best.mslp,
    refTime: typeof artifact.refTime === 'string' ? artifact.refTime : null,
  }
}

/**
 * Nearest-cell mean-sea-level-pressure lookup from the shared weather-grid
 * mirror. Tries the HF live-data repo first, then the bundled static
 * fallback — best-effort, never fabricates a reading on a total miss.
 */
export async function fetchWeatherGridMslp(lat: number, lon: number): Promise<WeatherGridMslp | null> {
  const pipeline = feedPipeline('weather-grid')
  const candidates = [
    pipeline.storagePath ? `${HF_LIVE_BASE}/${pipeline.storagePath}` : null,
    pipeline.staticPath ?? null,
  ].filter((u): u is string => u !== null)

  for (const url of candidates) {
    const artifact = await fetchGridArtifact(url)
    if (!artifact) continue
    const hit = nearestMslp(artifact, lat, lon)
    if (hit) return hit
  }
  return null
}
