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
import type { Pm25Plausibility } from '../lib/config/gridPlausibility'

export type TodayGridState =
  | { status: 'loading' }
  | {
      status: 'ready'
      pm25: number
      updatedAt: string
      stale: boolean
      distanceKm: number
      /** Raw 0-100 DQSS score, when the source artifact carries one for this
       * cell — absent otherwise (Glass-box: never fabricated). Already
       * present on `fetchGlobalGridSnapshot`'s response; TrustLine (UI
       * Tier-1 P3) is the first consumer, so it was not surfaced here
       * before. Optional (not `| undefined`) so existing fixtures that omit
       * it stay valid. */
      dqss?: number
      /** Whether `pm25` is a reading we can stand behind. The value is
       * passed through untouched either way — callers decide whether to
       * build a judgment on it, and the evidence panels show it regardless
       * (see `lib/config/gridPlausibility.ts`). */
      plausibility?: Pm25Plausibility
    }
  | { status: 'missing' }

/** A resolved state plus the point it was resolved for — same pattern as
 * `useCapsuleData`'s `ResolvedFor`. A result for the previous lat/lon is not
 * this point's answer: without this, a fetch that lands after the viewer's
 * coordinates already moved on would show the old point's reading under the
 * new location's label, then jump once the new fetch actually lands. */
interface ResolvedFor {
  state: TodayGridState
  lat: number | null
  lon: number | null
}

export function useTodayGrid(lat: number | null, lon: number | null): TodayGridState {
  const [resolved, setResolved] = useState<ResolvedFor>({ state: { status: 'loading' }, lat: null, lon: null })

  useEffect(() => {
    // Not resolved yet (`useResolvedLocation`'s `location` is still null) —
    // no fetch, and the read below already reports `loading` for a lat/lon
    // mismatch (initial state is lat:null/lon:null).
    if (lat === null || lon === null) return
    let alive = true
    const setState = (state: TodayGridState) => setResolved({ state, lat, lon })

    fetchGlobalGridSnapshot({ lat, lon, limit: 1 })
      .then((snapshot) => {
        if (!alive) return
        setState({
          status: 'ready',
          pm25: snapshot.pm25,
          updatedAt: snapshot.updatedAt,
          stale: snapshot.stale ?? false,
          distanceKm: snapshot.nearbyCells[0]?.distanceKm ?? 0,
          dqss: snapshot.dqss,
          plausibility: snapshot.plausibility,
        })
      })
      .catch(() => {
        if (alive) setState({ status: 'missing' })
      })

    return () => {
      alive = false
    }
  }, [lat, lon])

  // A result for a different point is not this point's answer — report
  // loading until the fetch for the current one lands (or, if lat/lon are
  // still null, forever loading — the initial state already matches that).
  if (resolved.lat !== lat || resolved.lon !== lon) return { status: 'loading' }
  return resolved.state
}
