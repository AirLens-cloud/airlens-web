// Pure math for the Ch4 (BRIEFING) chapter's field-report numbers — no React,
// no `three`, so this stays importable from a test or a future non-DOM
// consumer without pulling either dependency in.
import type { Pm25Grid } from '../shared/data/loaders'
import type { PeakCell } from './types'

/**
 * Scans the full PM2.5 grid for its hottest real cell. Deliberately a plain
 * O(nLat*nLon) scan (65,160 cells at the current 1° resolution) rather than a
 * precomputed "hotspots" index (that index belongs to a different codebase's
 * ObservatoryFlight and isn't part of this mirror's data contract) — cheap
 * enough to run once when the chapter's data resolves.
 */
export function findPeakCell(grid: Pm25Grid): PeakCell | null {
  const { meta } = grid
  let bestUg = -Infinity
  let bestLatIdx = -1
  let bestLonIdx = -1
  for (let latIdx = 0; latIdx < meta.nLat; latIdx++) {
    for (let lonIdx = 0; lonIdx < meta.nLon; lonIdx++) {
      const ug = grid.decodeByte(grid.data[latIdx * meta.nLon + lonIdx] ?? 0)
      if (ug > bestUg) {
        bestUg = ug
        bestLatIdx = latIdx
        bestLonIdx = lonIdx
      }
    }
  }
  if (bestLatIdx < 0) return null
  const lat = meta.latMin + bestLatIdx * meta.dLat
  const lon = meta.lonMin + bestLonIdx * meta.dLon
  const latLabel = `${Math.abs(lat).toFixed(1)}${lat >= 0 ? 'N' : 'S'}`
  const lonLabel = `${Math.abs(lon).toFixed(1)}${lon >= 0 ? 'E' : 'W'}`
  return { ug: bestUg, label: `${latLabel}, ${lonLabel}` }
}
