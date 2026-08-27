/**
 * useWeatherPageData — fetches everything the /weather page needs for one
 * location and exposes it as one state object. Each source degrades
 * independently (weather/aq/wind/mslp can each be null while the others
 * resolve) — sections render their own honest missing state per field
 * rather than the whole page failing together.
 */
import { useCallback, useEffect, useState } from 'react'
import { COMMUNITY_API_BASE } from '../lib/config/dataSources'
import { fetchAqHourly, fetchWeatherGridMslp, fetchWeatherHourly } from '../api/weatherProxy'
import type { WeatherGridMslp } from '../api/weatherProxy'
import { fetchWindField } from '../api/weather'
import { WindField } from '../lib/windField'
import type { OpenMeteoAqHourly, OpenMeteoWeatherHourly } from '../types/forecast'

export type WeatherPageStatus = 'loading' | 'ready'

export interface WeatherPageData {
  status: WeatherPageStatus
  /** false only when `VITE_COMMUNITY_API_BASE` is explicitly overridden to an
   * empty string — an honest, permanent "not configured" state, distinct from
   * a retryable network failure. `COMMUNITY_API_BASE` now carries a baked-in
   * public default (`lib/config/dataSources.ts`), so in every real build this
   * is true and the branch is a misconfiguration guard, not a live mode. */
  configured: boolean
  weather: OpenMeteoWeatherHourly | null
  aq: OpenMeteoAqHourly | null
  wind: WindField | null
  mslp: WeatherGridMslp | null
  fetchedAt: number | null
  retry: () => void
}

export function useWeatherPageData(lat: number, lon: number): WeatherPageData {
  const [status, setStatus] = useState<WeatherPageStatus>('loading')
  const [weather, setWeather] = useState<OpenMeteoWeatherHourly | null>(null)
  const [aq, setAq] = useState<OpenMeteoAqHourly | null>(null)
  const [wind, setWind] = useState<WindField | null>(null)
  const [mslp, setMslp] = useState<WeatherGridMslp | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [refetchToken, setRefetchToken] = useState(0)

  useEffect(() => {
    let alive = true
    // Deferred to a microtask rather than called synchronously in the effect
    // body — same reasoning as `useCapsuleData.ts`'s fetch effect: setState
    // belongs in the callback that reacts to something, not the effect body
    // itself (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      if (alive) setStatus('loading')
    })

    Promise.allSettled([
      fetchWeatherHourly(lat, lon),
      fetchAqHourly(lat, lon),
      fetchWindField('surface'),
      fetchWeatherGridMslp(lat, lon),
    ]).then(([weatherResult, aqResult, windResult, mslpResult]) => {
      if (!alive) return
      setWeather(weatherResult.status === 'fulfilled' ? weatherResult.value : null)
      setAq(aqResult.status === 'fulfilled' ? aqResult.value : null)
      setWind(windResult.status === 'fulfilled' ? windResult.value : null)
      setMslp(mslpResult.status === 'fulfilled' ? mslpResult.value : null)
      setFetchedAt(Date.now())
      setStatus('ready')
    })

    return () => {
      alive = false
    }
  }, [lat, lon, refetchToken])

  const retry = useCallback(() => {
    setRefetchToken((t) => t + 1)
  }, [])

  return { status, configured: COMMUNITY_API_BASE !== '', weather, aq, wind, mslp, fetchedAt, retry }
}
