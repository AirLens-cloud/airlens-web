/**
 * globeMarkers — station-shaped markers for the Globe's data layers.
 *
 * Ported from AirLens-platform apps/web `src/api/data.ts` `fetchGlobalMarkers`,
 * minus its dev-only mock tier: this repo has no `/mockups/` payloads, and the
 * source module's own comment records why that tier existed only behind a dev
 * gate (production must degrade to the empty state rather than publish fake
 * stations as live). The grid tier is unchanged — it reads the same PM2.5 grid
 * artifact through `fetchGlobalGridSnapshot` (HF live → bundled static).
 *
 * Glass-box: the grid artifact carries a point estimate only, so `pm25_p10` /
 * `pm25_p90` stay absent rather than being fabricated. DQSS is not attached
 * here either — the Globe reads it from `data_quality.json` via
 * `useDQSSData()`, which is a different quantity from a grid cell's `dqss`.
 */
import { fetchGlobalGridSnapshot, GLOBAL_GRID_SAMPLE_LIMIT } from './gridSnapshot'
import { logger } from '../lib/logger'

/**
 * Duck-typed marker shape consumed by `three/systems/stationParse.ts`. Kept
 * structural (not a shared nominal type) because the parser reads
 * `unknown[]` — it must stay tolerant of markers from other sources.
 */
export interface GlobeMarker {
  station_id: string
  city: string
  country: string
  location: { lat: number; lon: number }
  aqi: number
  pm25_p50: number
  source: string
}

/** Grid cells as globe markers. Any failure degrades to `[]` (data-independent load). */
export async function fetchGlobalMarkers(): Promise<GlobeMarker[]> {
  try {
    const snapshot = await fetchGlobalGridSnapshot({ limit: GLOBAL_GRID_SAMPLE_LIMIT })
    const markers: GlobeMarker[] = snapshot.nearbyCells.map((cell, idx) => ({
      station_id: `grid-${idx + 1}`,
      city: `Grid ${idx + 1}`,
      country: '',
      location: { lat: cell.lat, lon: cell.lon },
      aqi: cell.aqi,
      pm25_p50: cell.pm25,
      source: 'global_grid',
    }))
    const withAqi = markers.filter((m) => m.aqi > 0)
    if (withAqi.length === 0) {
      logger.warn(`fetchGlobalMarkers: ${markers.length} grid cells but 0 with AQI > 0`)
      return []
    }
    logger.info(`fetchGlobalMarkers: ${withAqi.length}/${markers.length} cells with AQI`)
    return markers
  } catch (err) {
    logger.warn('fetchGlobalMarkers: grid snapshot unavailable', err)
    return []
  }
}
