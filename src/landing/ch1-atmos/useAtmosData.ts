// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/useAtmosData.ts` (Wave L1, 2026-08-26); import path
// updated for this repo's shallower `src/landing/` nesting.
import { useEffect, useState } from 'react'
import { loadEarthPoints, loadFires, loadPm25, loadTft, loadTopo, loadWind } from '../shared/data/loaders'
import type { AtmosState } from './types'

export function useAtmosData(lod: 'low' | 'medium'): AtmosState {
  const [state, setState] = useState<AtmosState>({ status: 'loading', data: null, error: null })

  useEffect(() => {
    let alive = true
    Promise.all([
      loadEarthPoints(lod),
      loadPm25(),
      loadWind(),
      loadTft(),
      loadFires(),
      loadTopo(),
    ])
      .then(([points, pm25, wind, tft, fires, topo]) => {
        if (alive) setState({ status: 'ready', data: { points, pm25, wind, tft, fires, topo }, error: null })
      })
      .catch((err: unknown) => {
        if (alive) setState({ status: 'error', data: null, error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      alive = false
    }
  }, [lod])

  return state
}
