/**
 * feeds — pipeline-only subset of AirLens-platform apps/web
 * `src/lib/config/globeOntology.ts`.
 *
 * The source module is the single source of truth for the Globe's visual
 * grammar too (color scales, legends, layer motion/uncertainty contracts) —
 * none of that has a home here yet (this repo has no Globe renderer, DESIGN.md
 * says "UI는 최소한의 무스타일 검증 페이지만"). This module keeps only what the
 * fetch/fallback logic in `api/` needs: which feed a variable lives in, and
 * where that feed's file is (HF dataset repo path / CDN path / static
 * fallback path). Values below are copied verbatim from the source ontology
 * — if AirLens-platform's collection paths change, this file drifts and must
 * be re-synced by hand (no shared package between the two repos by design).
 */
import type { OverlayType } from '../../types/data'

export type FeedKind = 'aq-grid' | 'weather-grid' | 'marine-grid' | 'pollen-grid'

export interface PhenomenonPipeline {
  readonly feed: FeedKind
  readonly varKey?: string
  /** HF dataset repo (`Robeedau/airlens-live`, `HF_LIVE_BASE`) object path — 1st in the cascade. */
  readonly storagePath?: string
  /** mac GitHub Pages snapshot CDN (`SNAPSHOT_CDN_BASE`) relative path — 2nd, pm25/pm10 only. */
  readonly cdnPath?: string
  /** Bundled static fallback path (`public/`) — last resort. */
  readonly staticPath?: string
  readonly source: string
  readonly cadence: string
  readonly resolution: string
}

/** data-collect-hourly.yml cron cadence — all 4 grid feeds share it. */
const CADENCE_3H = '3h'

/** GEFS-chem mac publish only covers pm25/pm10 (no gas species). */
const CDN_COVERED_AQ_IDS: readonly string[] = ['pm25', 'pm10']

type AqId = 'pm25' | 'pm10' | 'o3' | 'no2' | 'co'

const aqPipeline = (id: AqId, varKey: string): PhenomenonPipeline => ({
  feed: 'aq-grid',
  varKey,
  storagePath: `aq-data/current-${id}-grid.json`,
  cdnPath: CDN_COVERED_AQ_IDS.includes(id) ? `current-${id}-grid.json` : undefined,
  staticPath: `/data/current-${id}-grid.json`,
  source: 'Open-Meteo Air Quality',
  cadence: CADENCE_3H,
  resolution: '5°',
})

const AQ_PIPELINES: Partial<Record<OverlayType, PhenomenonPipeline>> = {
  pm25: aqPipeline('pm25', 'pm2_5'),
  pm10: aqPipeline('pm10', 'pm10'),
  o3: aqPipeline('o3', 'ozone'),
  no2: aqPipeline('no2', 'nitrogen_dioxide'),
  co: aqPipeline('co', 'carbon_monoxide'),
}

/** Weather grid (STEP=10, lat -80..80) — one file, many fields (varKey per overlay). */
const WEATHER_FEED: PhenomenonPipeline = {
  feed: 'weather-grid',
  storagePath: 'wind-data/weather-grid.json',
  staticPath: '/data/weather/current/weather-grid.json',
  source: 'Open-Meteo Weather',
  cadence: CADENCE_3H,
  resolution: '10°',
}

const WEATHER_VAR_KEYS: Partial<Record<OverlayType, string>> = {
  temp: 'temp',
  rh: 'rh',
  precip: 'precip',
  cloud: 'cloud',
  uvi: 'uvi',
  mslp: 'mslp',
}

/** Marine grid (STEP=10, lat -60..60). */
const MARINE_FEED: PhenomenonPipeline = {
  feed: 'marine-grid',
  storagePath: 'wind-data/marine-data.json',
  staticPath: '/data/weather/current/marine-data.json',
  source: 'Open-Meteo Marine',
  cadence: CADENCE_3H,
  resolution: '10°',
}

const MARINE_VAR_KEYS: Partial<Record<OverlayType, string>> = {
  sst: 'sst',
  ssta: 'sst', // SSTA = SST − climatology, same field
  waves: 'waves',
  currents: 'current_vel',
}

/** Pollen grid (STEP=2, Europe bbox 34..72N / -12..45E). */
const POLLEN_FEED: PhenomenonPipeline = {
  feed: 'pollen-grid',
  storagePath: 'aq-data/pollen-grid.json',
  staticPath: '/data/pollen-grid.json',
  source: 'Open-Meteo CAMS pollen',
  cadence: CADENCE_3H,
  resolution: '2°',
}

const POLLEN_VAR_KEYS: Partial<Record<OverlayType, string>> = {
  pollen_grass: 'grass',
  pollen_birch: 'birch',
  pollen_alder: 'alder',
  pollen_mugwort: 'mugwort',
  pollen_olive: 'olive',
  pollen_ragweed: 'ragweed',
}

/** Feed payload's per-overlay variable key. */
export function feedVarKeys(feed: FeedKind): Partial<Record<OverlayType, string>> {
  switch (feed) {
    case 'aq-grid':
      return Object.fromEntries(
        Object.entries(AQ_PIPELINES).map(([id, p]) => [id, p!.varKey!]),
      ) as Partial<Record<OverlayType, string>>
    case 'weather-grid':
      return WEATHER_VAR_KEYS
    case 'marine-grid':
      return MARINE_VAR_KEYS
    case 'pollen-grid':
      return POLLEN_VAR_KEYS
  }
}

/** Per-overlay object path (aq-grid only — weather/marine/pollen share one file, see feedPipeline). */
export function feedObjectPaths(
  feed: FeedKind,
  which: 'storagePath' | 'cdnPath' | 'staticPath',
): Partial<Record<OverlayType, string>> {
  if (feed !== 'aq-grid') return {}
  return Object.fromEntries(
    Object.entries(AQ_PIPELINES)
      .filter(([, p]) => !!p![which])
      .map(([id, p]) => [id, p![which]!]),
  ) as Partial<Record<OverlayType, string>>
}

/** The common pipeline (path/cadence/resolution) a feed's overlays all share. */
export function feedPipeline(feed: FeedKind): PhenomenonPipeline {
  switch (feed) {
    case 'aq-grid':
      throw new Error('feedPipeline: aq-grid has per-overlay paths — use feedObjectPaths instead')
    case 'weather-grid':
      return WEATHER_FEED
    case 'marine-grid':
      return MARINE_FEED
    case 'pollen-grid':
      return POLLEN_FEED
  }
}

// ── Wind ─────────────────────────────────────────────────────────────────────

/** Levels the collector (scripts/etl/collect_gfs_wind.py) actually fetches. */
export const WIND_LEVELS: readonly ('surface' | '850hPa')[] = ['surface', '850hPa']

/** Wind level → file slug, matching the collector's slug rule. */
export function windLevelSlug(level: 'surface' | '850hPa'): string {
  return `wind-${level.toLowerCase()}`
}

// ── Timeline ─────────────────────────────────────────────────────────────────

/** PM2.5 forecast (NOAA GEFS-Aerosols) manifest staleness — 12h SLA, from the
 *  source ontology's `pm25.forecastPipeline.freshnessSlaH`. */
export const TIMELINE_STALE_MS: number = 12 * 3600 * 1000

// ── Article feeds (news.ts / blog.ts) ───────────────────────────────────────

/**
 * In-memory feed cache lifetime, shared by `api/news.ts` and `api/blog.ts` —
 * long enough to dedupe bursts of near-simultaneous requests, short enough
 * that a newly published article/post shows up promptly. Matters most for
 * the SSR Cloudflare Pages Function (`functions/_lib/data.ts` reuses both
 * modules' fetchers): a warm `workerd` isolate can be reused across many
 * requests over a long span, and this module-scope cache has no other
 * expiry — without a TTL, a new article would never reach crawler responses
 * until the isolate happened to recycle (code review finding, Wave 1 SSR port).
 */
export const FEED_CACHE_TTL_MS: number = 5 * 60 * 1000
