// Ported from AirLens-platform apps/landing-lab
// `src/concepts/particulate/useParticulateData.ts` (Wave L2, 2026-08-26);
// import path updated for this repo's shallower `src/landing/` nesting.
import { useEffect, useMemo, useState } from 'react'
import { loadPm25, loadTft, loadTopo, loadWind } from '../shared/data/loaders'
import type { ParticulateData, ParticulateState, Place } from './types'

export function useParticulateData(): ParticulateState {
  const [state, setState] = useState<ParticulateState>({ status: 'loading', data: null, error: null })

  useEffect(() => {
    let alive = true
    Promise.all([loadPm25(), loadWind(), loadTft(), loadTopo()])
      .then(([pm25, wind, tft, topo]) => {
        if (alive) setState({ status: 'ready', data: { pm25, wind, tft, topo }, error: null })
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

/**
 * The TFT city list, each city carrying what the live grid says about it —
 * sorted thickest air first. Nothing here is authored: the PM2.5 and the wind
 * are both sampled from the loaded fields at the city's own coordinates.
 */
export function usePlaces(data: ParticulateData | null): Place[] {
  return useMemo(() => {
    if (!data) return []
    const { pm25, wind, tft } = data
    return tft.cities
      .map((c): Place => {
        const [u, v] = wind.sample(c.lat, c.lon)
        return {
          name: c.name,
          country: c.country_code,
          lat: c.lat,
          lon: c.lon,
          pm25: pm25.sampleAt(c.lat, c.lon),
          windSpeed: Math.hypot(u, v),
          forecast: c,
        }
      })
      .sort((a, b) => b.pm25 - a.pm25)
  }, [data])
}
