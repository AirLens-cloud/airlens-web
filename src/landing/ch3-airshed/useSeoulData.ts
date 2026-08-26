// Ported from AirLens-platform apps/landing-lab
// `src/concepts/seoul/useSeoulData.ts` (Wave L3, 2026-08-26); import path
// updated for this repo's shallower `src/landing/` nesting, `SEOUL` rebound to
// this chapter's local `./theme`, and `loadShapSeoul()` dropped from the
// `Promise.all` (with the `shap` field it fed) — this port excludes
// `ShapPanel` (approved decision D3), so nothing here needs it.
import { useEffect, useState } from 'react'
import { loadPm25, loadTft, loadWind } from '../shared/data/loaders'
import { featureCentroid, loadSeoulDistricts, outerRings } from './geo'
import { SEOUL } from './theme'
import { haversineKm, hashSeed, pmToColor, pmToHeight, projectLocalKm, SEOUL_CENTER } from './projection'
import type { DistrictInfo, ForecastGap, SeoulData, SeoulState } from './types'

export function useSeoulData(): SeoulState {
  const [state, setState] = useState<SeoulState>({ status: 'loading', data: null, error: null })

  useEffect(() => {
    let alive = true
    Promise.all([loadSeoulDistricts(), loadPm25(), loadWind(), loadTft()])
      .then(([raw, pm25, wind, tft]) => {
        if (!alive) return

        const districts: DistrictInfo[] = raw.features.map((f) => {
          const centroid = featureCentroid(f)
          const pm = pm25.sampleAt(centroid.lat, centroid.lon)
          const ringsLocal = outerRings(f).map((ring) => ring.map(([lon, lat]) => projectLocalKm(lat, lon)))
          return {
            code: f.properties.code,
            name: f.properties.name,
            nameEng: f.properties.name_eng,
            centroid,
            pm25: pm,
            colorHex: pmToColor(pm, SEOUL.pmClean, SEOUL.pmWarm, SEOUL.pmHot),
            height: pmToHeight(pm),
            localCentroid: projectLocalKm(centroid.lat, centroid.lon),
            ringsLocal,
            seed: hashSeed(f.properties.code),
          }
        })

        const meanPm25 = districts.reduce((s, d) => s + d.pm25, 0) / Math.max(1, districts.length)

        // Honesty check: does any TFT-covered city sit at/near Seoul? None does in this
        // snapshot (TFT's 50 cities don't include Seoul) — name the nearest one instead
        // of silently omitting the forecast, so the gap itself is legible.
        let nearest: { name: string; country: string; dist: number } | null = null
        for (const c of tft.cities) {
          const dist = haversineKm(SEOUL_CENTER.lat, SEOUL_CENTER.lon, c.lat, c.lon)
          if (nearest === null || dist < nearest.dist) nearest = { name: c.name, country: c.country_code, dist }
        }
        const forecastGap: ForecastGap = nearest
          ? { nearestCity: nearest.name, nearestCountry: nearest.country, distanceKm: nearest.dist }
          : { nearestCity: 'unknown', nearestCountry: '', distanceKm: NaN }

        const data: SeoulData = { districts, wind, pm25, tft, raw, forecastGap, meanPm25 }
        setState({ status: 'ready', data, error: null })
      })
      .catch((err: unknown) => {
        if (alive) setState({ status: 'error', data: null, error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      alive = false
    }
  }, [])

  return state
}
