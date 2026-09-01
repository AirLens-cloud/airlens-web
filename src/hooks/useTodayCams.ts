/**
 * useTodayCams — CAMS forecast (`fetchForecast()`) resolved to the city
 * nearest the viewer's chosen location. Unlike `useCapsuleData` (Home,
 * always the feed's "thickest air" city), Today is location-specific: the
 * fetch itself carries no location parameter (the feed returns every city
 * at once), so this hook fetches once and re-derives the nearest match
 * whenever lat/lon changes rather than re-fetching.
 */
import { useEffect, useMemo, useState } from 'react'
import { fetchForecast } from '../lib/today/forecastSource'
import { pickNearestCity } from '../lib/today/nearestCity'
import { tierFromPm25 } from '../components/fluid/capsule/useCapsuleData'
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
    }
  | { status: 'missing' }

type PayloadState = 'loading' | ForecastPayload | null

export function useTodayCams(lat: number, lon: number): TodayCamsState {
  const [payload, setPayload] = useState<PayloadState>('loading')

  useEffect(() => {
    let alive = true
    fetchForecast()
      .then((p) => {
        if (alive) setPayload(p)
      })
      .catch(() => {
        if (alive) setPayload(null)
      })
    return () => {
      alive = false
    }
  }, [])

  return useMemo(() => {
    if (payload === 'loading') return { status: 'loading' }
    if (!payload) return { status: 'missing' }
    const nearest = pickNearestCity(payload.cities, lat, lon)
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
      updatedAt: payload.generated_at,
    }
  }, [payload, lat, lon])
}
