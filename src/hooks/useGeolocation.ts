/**
 * useGeolocation — opt-in browser geolocation for the Weather page.
 *
 * No auto-prompt: `requestLocation()` must be called from a user gesture (a
 * button click). Denial, an unsupported browser, or any error falls back to
 * Seoul with an honest "default location" label — never a silent guess at
 * the visitor's location. The last chosen location (geolocation result or a
 * city-search pick) persists to localStorage so a returning visitor doesn't
 * have to re-choose every session; a private window or blocked storage just
 * means the Seoul default reappears.
 *
 * First visit only (no stored pick yet), this also tries the edge's
 * IP-approximate location (`approxLocation.ts`) as a better-than-Seoul
 * default — labeled honestly as approximate, never persisted to
 * localStorage (a fetch result, not a chosen pick — see `source: 'approx'`
 * below), and instantly superseded the moment a real request/pick lands.
 * Seoul stays the final fallback if the approximate lookup also comes up empty.
 */
import { useCallback, useEffect, useState } from 'react'
import { getApproxLocation } from '../lib/geo/approxLocation'

export type GeoSource = 'user' | 'default' | 'approx'

export interface GeoLocationState {
  lat: number
  lon: number
  source: GeoSource
  label: string
}

export interface UseGeolocationResult {
  location: GeoLocationState
  requesting: boolean
  denied: boolean
  requestLocation: () => void
  setLocation: (next: { lat: number; lon: number; label: string }) => void
}

export const SEOUL_DEFAULT: GeoLocationState = {
  lat: 37.5665,
  lon: 126.978,
  source: 'default',
  label: 'Seoul (default)',
}

const STORAGE_KEY = 'airlens-weather-location'
const GEOLOCATION_TIMEOUT_MS = 8000
const GEOLOCATION_MAX_AGE_MS = 5 * 60 * 1000

function readStoredLocation(): GeoLocationState | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GeoLocationState>
    if (
      typeof parsed.lat !== 'number' ||
      typeof parsed.lon !== 'number' ||
      !Number.isFinite(parsed.lat) ||
      !Number.isFinite(parsed.lon)
    ) {
      return null
    }
    return {
      lat: parsed.lat,
      lon: parsed.lon,
      source: parsed.source === 'user' ? 'user' : 'default',
      label: typeof parsed.label === 'string' && parsed.label.length > 0 ? parsed.label : SEOUL_DEFAULT.label,
    }
  } catch {
    return null
  }
}

function writeStoredLocation(loc: GeoLocationState): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loc))
  } catch {
    // Storage denied/unavailable — in-memory state still works this session.
  }
}

export function useGeolocation(): UseGeolocationResult {
  const [location, setLocationState] = useState<GeoLocationState>(() => readStoredLocation() ?? SEOUL_DEFAULT)
  const [requesting, setRequesting] = useState(false)
  const [denied, setDenied] = useState(false)

  // Mount-only, and only when there's no stored user pick to respect —
  // fires once, never re-fetches on a later request/pick (deps: []).
  useEffect(() => {
    if (readStoredLocation() !== null) return
    let alive = true
    getApproxLocation().then((approx) => {
      if (!alive || approx === null) return
      setLocationState((current) => {
        // A real request/pick may have landed while the fetch was in
        // flight — never clobber it with the slower approximate result.
        if (current.source !== 'default') return current
        return {
          lat: approx.lat,
          lon: approx.lon,
          source: 'approx',
          label: approx.city ? `${approx.city} (approximate, IP-based)` : 'Approximate area',
        }
      })
    })
    return () => {
      alive = false
    }
  }, [])

  const setLocation = useCallback((next: { lat: number; lon: number; label: string }): void => {
    const loc: GeoLocationState = { lat: next.lat, lon: next.lon, source: 'user', label: next.label }
    setLocationState(loc)
    writeStoredLocation(loc)
  }, [])

  const requestLocation = useCallback((): void => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDenied(true)
      return
    }
    setRequesting(true)
    setDenied(false)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRequesting(false)
        const loc: GeoLocationState = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          source: 'user',
          label: 'My location',
        }
        setLocationState(loc)
        writeStoredLocation(loc)
      },
      () => {
        setRequesting(false)
        setDenied(true)
      },
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS },
    )
  }, [])

  return { location, requesting, denied, requestLocation, setLocation }
}
