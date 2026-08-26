// Same shape as `ch1-atmos/useAtmosData.ts` and `ch3-airshed/useSeoulData.ts` —
// `Promise.all` over the shared mirror loaders, one `DawnBriefingState`.
// `loadPm25`/`loadFires`/`loadTft` are already resolved by the time a visitor
// scrolls this far (Chapter 1's `useAtmosData` fetches the same three feeds),
// so this hook's own fetch is effectively free — `once()` in `loaders.ts`
// caches by URL, not by caller.
import { useEffect, useState } from 'react'
import { loadFires, loadPm25, loadTft } from '../shared/data/loaders'
import { findPeakCell } from './projection'
import type { DawnBriefingState, DawnForecastRow } from './types'

/** +48H mark into a city's hourly series, clamped to its last available hour. */
function forecastRowAt48h(tft: Awaited<ReturnType<typeof loadTft>>): DawnForecastRow | null {
  const city = tft.cities[0]
  if (!city || city.hourly.length === 0) return null
  const idx = Math.min(47, city.hourly.length - 1)
  const hour = city.hourly[idx]
  if (!hour) return null
  return {
    city: city.name,
    p50: hour.pm25,
    p10: Number.isFinite(hour.pm25_p10) ? hour.pm25_p10 : null,
    p90: Number.isFinite(hour.pm25_p90) ? hour.pm25_p90 : null,
    // This mirror's tft.json carries no per-hour DQSS grade — 'unknown' is the
    // honest label, never an invented A-F.
    dqss: 'unknown',
  }
}

export function useDawnBriefingData(): DawnBriefingState {
  const [state, setState] = useState<DawnBriefingState>({ status: 'loading', data: null, error: null })

  useEffect(() => {
    let alive = true
    Promise.all([loadPm25(), loadFires(), loadTft()])
      .then(([pm25, fires, tft]) => {
        if (!alive) return
        setState({
          status: 'ready',
          data: {
            gridCells: pm25.meta.nLat * pm25.meta.nLon,
            peak: findPeakCell(pm25),
            firesTotal: fires.total,
            forecast: forecastRowAt48h(tft),
            pm25,
            fires,
            tft,
          },
          error: null,
        })
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
