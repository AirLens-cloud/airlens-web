/**
 * useTodayGrid — nearest PM2.5 grid cell (`fetchGlobalGridSnapshot`) for the
 * viewer's chosen location. Refetches whenever lat/lon changes. AQI is
 * deliberately not surfaced here — `gridSnapshot.ts`'s `aqi` field is a
 * known non-standard conversion (page-specs/today-decision-surface.md §6-2)
 * still pending a B0 fix upstream, so Today only ever renders the raw PM2.5
 * concentration this hook exposes.
 */
import { useEffect, useState } from 'react'
import { fetchGlobalGridSnapshot } from '../api/gridSnapshot'

export type TodayGridState =
  | { status: 'loading' }
  | { status: 'ready'; pm25: number; updatedAt: string; stale: boolean; distanceKm: number }
  | { status: 'missing' }

export function useTodayGrid(lat: number, lon: number): TodayGridState {
  const [state, setState] = useState<TodayGridState>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    // Deferred to a microtask rather than called synchronously in the effect
    // body — same reasoning as `useWeatherPageData.ts`'s fetch effect
    // (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      if (alive) setState({ status: 'loading' })
    })

    fetchGlobalGridSnapshot({ lat, lon, limit: 1 })
      .then((snapshot) => {
        if (!alive) return
        setState({
          status: 'ready',
          pm25: snapshot.pm25,
          updatedAt: snapshot.updatedAt,
          stale: snapshot.stale ?? false,
          distanceKm: snapshot.nearbyCells[0]?.distanceKm ?? 0,
        })
      })
      .catch(() => {
        if (alive) setState({ status: 'missing' })
      })

    return () => {
      alive = false
    }
  }, [lat, lon])

  return state
}
