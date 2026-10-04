/**
 * useTodayCams — CAMS forecast (`fetchForecast()`) resolved to the city
 * nearest the viewer's chosen location. Independent implementation from
 * `useCapsuleData` (Home/capsule's own nearest-city lookup): the fetch
 * itself carries no location parameter (the feed returns every city at
 * once), so this hook fetches once and re-derives the nearest match
 * whenever lat/lon changes rather than re-fetching.
 */
import { useEffect, useMemo, useState } from 'react'
import { fetchForecast } from '../lib/today/forecastSource'
import { pickNearestCity } from '../lib/today/nearestCity'
import { tierFromPm25 } from '../components/fluid/capsule/useCapsuleData'
import { DEFAULT_MAX_AGE_HOURS } from '../api/gridSnapshot'
import type { ForecastPayload } from '../types/forecast'
import type { CapsuleSeriesPoint } from '../components/fluid/capsule/useCapsuleData'
import type { AqiTier } from '../components/wireframe/AqiDot'

export type TodayCamsState =
  | { status: 'loading' }
  | {
      status: 'ready'
      cityName: string
      countryCode: string
      distanceKm: number
      current: number
      tier: AqiTier
      series24h: CapsuleSeriesPoint[]
      updatedAt: string
      /** Same 48h threshold `gridSnapshot.ts` judges GRID staleness by
       * (`DEFAULT_MAX_AGE_HOURS`) — null when `generated_at` cannot be
       * parsed, never a guessed true/false. `forecastSource.ts`'s bundled
       * static fallback is explicitly "may be stale", so this must not
       * default to `false`. */
      stale: boolean | null
    }
  | { status: 'missing' }

/** `Date.now()` here runs inside an async `.then()` callback (after the
 * fetch resolves), not during render — the same reason `gridSnapshot.ts`'s
 * own staleness check is clean under the purity lint despite calling it. */
function staleFromGeneratedAt(generatedAt: string): boolean | null {
  const generatedMs = new Date(generatedAt).getTime()
  if (!Number.isFinite(generatedMs)) return null
  const ageHours = (Date.now() - generatedMs) / 3_600_000
  return ageHours > DEFAULT_MAX_AGE_HOURS
}

interface FetchedPayload {
  payload: ForecastPayload
  stale: boolean | null
}

type PayloadState = 'loading' | FetchedPayload | null

export function useTodayCams(lat: number | null, lon: number | null): TodayCamsState {
  const [payload, setPayload] = useState<PayloadState>('loading')
  // The feed fetch itself carries no location parameter (see the header
  // comment), so the effect keys on "has a location resolved at all", not on
  // lat/lon: the first fetch waits for a location (`useResolvedLocation`'s
  // "no fetch while still resolving" contract), and a later lat/lon change
  // re-derives the nearest match via the `useMemo` below without cancelling
  // an in-flight fetch. A lat/lon-keyed effect with a has-fetched ref used to
  // leave `payload` stuck at 'loading' for good when the location changed
  // mid-fetch (cleanup dropped the result, the re-run skipped refetching) —
  // and under StrictMode's mount/unmount/mount on every dev load.
  const hasLocation = lat !== null && lon !== null

  useEffect(() => {
    if (!hasLocation) return
    let alive = true
    fetchForecast()
      .then((p) => {
        if (!alive) return
        setPayload(p ? { payload: p, stale: staleFromGeneratedAt(p.generated_at) } : null)
      })
      .catch(() => {
        if (alive) setPayload(null)
      })
    return () => {
      alive = false
    }
  }, [hasLocation])

  return useMemo(() => {
    if (lat === null || lon === null) return { status: 'loading' }
    if (payload === 'loading') return { status: 'loading' }
    if (!payload) return { status: 'missing' }
    const { payload: forecast, stale } = payload
    const nearest = pickNearestCity(forecast.cities, lat, lon)
    const now = nearest?.city.hourly[0]
    if (!nearest || !now || !Number.isFinite(now.pm25)) return { status: 'missing' }

    const series24h: CapsuleSeriesPoint[] = []
    for (const hour of nearest.city.hourly.slice(0, 24)) {
      if (!Number.isFinite(hour.pm25)) continue
      series24h.push({
        time: hour.time,
        p10: Number.isFinite(hour.pm25_p10) ? (hour.pm25_p10 as number) : null,
        p50: hour.pm25,
        p90: Number.isFinite(hour.pm25_p90) ? (hour.pm25_p90 as number) : null,
      })
    }

    return {
      status: 'ready',
      cityName: nearest.city.name,
      countryCode: nearest.city.country_code,
      distanceKm: nearest.distanceKm,
      current: now.pm25,
      tier: tierFromPm25(now.pm25),
      series24h,
      updatedAt: forecast.generated_at,
      stale,
    }
  }, [payload, lat, lon])
}
