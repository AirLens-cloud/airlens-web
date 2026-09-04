/**
 * Weather / wind field service. Ported from AirLens-platform apps/web
 * `src/api/weather.ts`.
 *
 * `getForecast`/`fetchTFTForecast`/`fetchWindGrid`/`fetchMarineGrid`/
 * `fetchSSTAGrid`/`fetchOceanCurrents` are dead-end stubs in the source too —
 * ported verbatim for parity, real work is `fetchWindField`.
 */
import { WindField } from '../lib/windField'
import { WIND_LEVELS, windLevelSlug } from '../lib/config/feeds'
import { HF_LIVE_BASE } from '../lib/config/dataSources'
import type {
  WindGridPoint,
  PressureLevel,
  MarineGridPoint,
} from '../types/data'
import type { WeatherForecastData } from '../types/forecast'

/** All 8 pressure levels the type allows (only WIND_LEVELS are actually collected). */
const PRESSURE_LEVELS: readonly PressureLevel[] = [
  'surface', '1000hPa', '850hPa', '700hPa', '500hPa', '250hPa', '70hPa', '10hPa',
]

export async function getForecast(
  _lat: number,
  _lon: number,
): Promise<WeatherForecastData> {
  return {
    hourly: [],
    lat: _lat,
    lon: _lon,
    timezone: '',
    fetchedAt: Date.now(),
  }
}

export async function fetchTFTForecast(
  ..._args: unknown[]
): Promise<WeatherForecastData | null> {
  return null
}

export async function fetchWindGrid(): Promise<WindGridPoint[]> {
  return []
}

/**
 * Which levels we actually collect — WIND_LEVELS (`lib/config/feeds.ts`) is
 * the only judge, slug rule matches the collector (scripts/etl/collect_gfs_wind.py).
 * Levels absent from the list are null = no data. No level borrows another
 * level's file — showing surface wind under an 850hPa label would be a lie.
 */
const WIND_LEVEL_SLUG: Record<PressureLevel, string | null> = Object.fromEntries(
  PRESSURE_LEVELS.map((level) => [
    level,
    (WIND_LEVELS as readonly string[]).includes(level) ? windLevelSlug(level as 'surface' | '850hPa') : null,
  ]),
) as Record<PressureLevel, string | null>

type GfsRecord = {
  header: {
    nx: number; ny: number; lo1: number; la1: number; dx: number; dy: number
    refTime?: string; generatedAt?: string; level?: string; resolution?: number
  }
  data: number[]
}

/**
 * HF live-data repo is the primary; the committed static file (2nd, in
 * `public/data/weather/current/`) is a verbatim mirror of the same artifact,
 * refreshed on every build by scripts/prefetch-fallback-data.mjs — not an
 * actual reduced-resolution downsample.
 */
function windSources(slug: string): string[] {
  return [
    `${HF_LIVE_BASE}/wind-data/${slug}.json`,
    `/data/weather/current/${slug}.json`,
  ]
}

/**
 * Fetch the wind field for one pressure level.
 *
 * Returns null when that level has no data — the caller renders nothing
 * rather than substituting another level. An empty WindField would be worse
 * than null: zero wind everywhere is indistinguishable from genuinely calm air.
 */
export async function fetchWindField(
  level: PressureLevel = 'surface',
): Promise<WindField | null> {
  const slug = WIND_LEVEL_SLUG[level]
  if (!slug) return null

  for (const url of windSources(slug)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      // A missing static fallback file used to come back 200 + index.html
      // (the SPA catch-all in public/_redirects) — `functions/data/[[path]].ts`
      // now 404s that server-side; this guard is defense-in-depth for hosts
      // that don't run that Function (e.g. `vite preview`).
      const contentType = res.headers?.get('content-type') ?? ''
      if (contentType.includes('text/html')) continue
      const records = await res.json() as [GfsRecord, GfsRecord]
      if (!Array.isArray(records) || records.length < 2) continue
      const h = records[0].header
      return WindField.fromGFSRecords(records[0], records[1], {
        level,
        refTime: h.refTime ?? '',
        generatedAt: h.generatedAt ?? '',
        resolution: h.resolution ?? h.dx,
      })
    } catch {
      continue // try the next tier
    }
  }
  return null
}

export async function fetchMarineGrid(
  ..._args: unknown[]
): Promise<MarineGridPoint[]> {
  return []
}

export async function fetchSSTAGrid(): Promise<MarineGridPoint[]> {
  return []
}

export async function fetchOceanCurrents(): Promise<WindGridPoint[]> {
  return []
}
