import { useEffect, useState } from 'react'
import { fetchForecastBand } from '../api/forecastBand'
import type { ForecastBandResponse } from '../types/forecastBand'

export type UseForecastBandStatus = 'loading' | 'ready' | 'empty' | 'error'

export interface UseForecastBandResult {
  status: UseForecastBandStatus
  response: ForecastBandResponse | null
}

const INITIAL: UseForecastBandResult = { status: 'loading', response: null }
const ERROR: UseForecastBandResult = { status: 'error', response: null }

/**
 * useForecastBand — the TimesFM zero-shot forecast band (`w3-band-v1`),
 * fetched once per mount. `error` (fetch/parse failure) and `empty` (a
 * successfully-read payload with no cities) are reported as different facts
 * — design-taxonomy §5, same split `useCityPrediction` and `useInsightsData`
 * already make for their own feeds.
 */
export function useForecastBand(): UseForecastBandResult {
  const [result, setResult] = useState<UseForecastBandResult>(INITIAL)

  useEffect(() => {
    let cancelled = false
    fetchForecastBand()
      .then((res) => {
        if (cancelled) return
        if (!res.ok) {
          setResult(ERROR)
          return
        }
        setResult({
          status: res.data.cities.length > 0 ? 'ready' : 'empty',
          response: res.data,
        })
      })
      .catch(() => {
        if (!cancelled) setResult(ERROR)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return result
}
