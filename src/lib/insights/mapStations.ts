/**
 * Country panels → dotted-map station points for one year.
 *
 * Adapted from AirLens-platform `apps/web/src/api/policyComparison.ts`
 * (`buildYearStations`). Same contract, new panel shape: the point now carries
 * a source list rather than a single source string.
 *
 * Every exclusion is counted and returned, because the map's honesty depends on
 * the reader knowing what is missing: a country with no observation that year
 * is a gap in the data, and a country with no map anchor is a gap in this
 * repo's coordinate table. Those are different failures and neither may be
 * silently dropped into "the map just looks sparse".
 */
import { COUNTRY_CENTERS } from '../config/countryCenters'
import type { CountryPanel } from '../../types/policy'
import type { StationData } from '../../types/dotted-map'

export interface YearStations {
  stations: StationData[]
  /** Countries observed that year but with no coordinate in COUNTRY_CENTERS. */
  droppedNoAnchor: string[]
  /** Countries with a panel but no observation for this year. */
  droppedNoObservation: string[]
  /** Distinct source tags behind the plotted points. */
  sources: string[]
}

export function buildYearStations(panels: CountryPanel[], year: number): YearStations {
  const stations: StationData[] = []
  const noAnchor = new Set<string>()
  const noObservation = new Set<string>()
  const sources = new Set<string>()

  for (const panel of panels) {
    const cc = panel.countryCode.toUpperCase()
    const point = panel.points.find((p) => p.year === year)
    if (!point || !Number.isFinite(point.pm25)) {
      noObservation.add(cc)
      continue
    }
    const center = COUNTRY_CENTERS[cc]
    if (!center) {
      noAnchor.add(cc)
      continue
    }
    stations.push({ latitude: center[0], longitude: center[1], pm25: point.pm25 })
    for (const s of point.sources) {
      if (s && s !== 'unknown') sources.add(s)
    }
  }

  return {
    stations,
    droppedNoAnchor: [...noAnchor].sort(),
    droppedNoObservation: [...noObservation].sort(),
    sources: [...sources].sort(),
  }
}

/** Every year any panel observes, ascending. */
export function panelYears(panels: CountryPanel[]): number[] {
  const years = new Set<number>()
  for (const p of panels) for (const pt of p.points) years.add(pt.year)
  return [...years].sort((a, b) => a - b)
}
