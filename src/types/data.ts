/**
 * Data-layer domain types — ported subset from AirLens-platform apps/web
 * `src/types/globe.ts` / `src/types/weather.ts`. Only the shapes the data
 * layer (api/, lib/, hooks/) actually consumes are copied here; the visual
 * (color scale / legend / layer-grammar) types stay in the source monorepo,
 * which still owns the Globe rendering surface this repo doesn't have yet.
 */

// ── Overlay / grid ──────────────────────────────────────────────────────────

/** Atmospheric pressure level for altitude-aware data. */
export type PressureLevel =
  | 'surface'
  | '1000hPa'
  | '850hPa'
  | '700hPa'
  | '500hPa'
  | '250hPa'
  | '70hPa'
  | '10hPa'

/** Wind-specific subset of PressureLevel — the only levels actually collected. */
export type WindLevel = Extract<PressureLevel, 'surface' | '850hPa'>

/** Data overlay type rendered on the globe surface (source of the fetch cascade). */
export type OverlayType =
  | 'wind'
  | 'temp'
  | 'rh'
  | 'dewpoint'
  | 'wetbulb'
  | '3hpa'
  | 'cape'
  | 'tpw'
  | 'tcw'
  | 'mslp'
  | 'mi'
  | 'uvi'
  | 'wpd'
  | 'pm25'
  | 'pm10'
  | 'o3'
  | 'no2'
  | 'so2'
  | 'co'
  | 'precip'
  | 'cloud'
  | 'currents'
  | 'sst'
  | 'ssta'
  | 'waves'
  | 'pollen_alder'
  | 'pollen_birch'
  | 'pollen_grass'
  | 'pollen_mugwort'
  | 'pollen_olive'
  | 'pollen_ragweed'
  | 'none'

/** Grid data for overlay rendering (equirectangular). */
export interface OverlayGridData {
  values: Float32Array
  nLat: number
  nLon: number
  latMin: number
  lonMin: number
  dLat: number
  dLon: number
  overlayType: OverlayType
  /** null when the source payload carries no timestamp/generatedAt — honest
   *  "unknown", never a fabricated "now". */
  timestamp: number | null
  /** Provenance label from the grid JSON (e.g. "NOAA GEFS-Aerosols"). */
  source?: string
}

// ── Wind field ───────────────────────────────────────────────────────────────

export interface WindGridPoint {
  lat: number
  lon: number
  speed: number // m/s
  direction: number // degrees (0=N, 90=E, 180=S, 270=W)
}

/** Provenance of a fetched wind field — what level, how fresh, how coarse. */
export interface WindFieldMeta {
  level: PressureLevel
  refTime: string
  generatedAt: string
  resolution: number
}

/** Structured wind field for bilinear interpolation (nullschool-style). */
export interface WindFieldData {
  u: Float32Array
  v: Float32Array
  nLat: number
  nLon: number
  latMin: number
  lonMin: number
  dLat: number
  dLon: number
  meta?: WindFieldMeta
}

export interface MarineGridPoint {
  lat: number
  lon: number
  value: number
}

// ── Global grid snapshot ────────────────────────────────────────────────────

/** PM2.5 severity grade — grade cut 15/35/75 µg/m³. */
export type PM25Grade = 'Good' | 'Moderate' | 'Unhealthy' | 'Very Unhealthy'

export interface GlobalGridCell {
  lat: number
  lon: number
  pm25: number
  aqi: number
  updatedAt: string
  dqss?: number
  confidence?: number
  distanceKm?: number
  grade?: PM25Grade
}

export interface GlobalGridSnapshot {
  pm25: number
  aqi: number
  lat: number
  lon: number
  source: 'global_grid'
  updatedAt: string
  dqss?: number
  confidence?: number
  nearbyCells: GlobalGridCell[]
  grade?: PM25Grade
  /** 48h — true when the source artifact's `updatedAt` is older than that. */
  stale?: boolean
}

export interface GlobalGridSnapshotOptions {
  lat?: number
  lon?: number
  radiusKm?: number
  limit?: number
}
