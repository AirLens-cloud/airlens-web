/**
 * useResolvedLocation — the single location pipeline for Today, Home, and
 * the floating AqiCapsule (W1a). Replaces two previously-separate hooks:
 *
 *  - `useGeolocation` (Today's own pipeline): defaulted to Seoul on mount
 *    and persisted every chosen location — INCLUDING a precise device GPS
 *    fix labeled 'My location' — to localStorage, violating G1 (a
 *    geolocation fix must never be written to disk).
 *  - `useLocationPersonalization` (Home/capsule's pipeline): already
 *    G1-compliant (geolocation choices were session-only), but with no
 *    choice/approx resolved yet it left callers to fall back to the feed's
 *    worldwide "thickest air" city — very unlikely to be the visitor's own
 *    air, and a different fallback than Today's Seoul default.
 *
 * Every surface now resolves through one shared `useLocationChoiceStore`
 * and one priority chain (`resolveLocation.ts`: choice > approx > Seoul
 * default) — `location` is `null` only while genuinely still resolving
 * (no choice, and the approximate lookup hasn't settled either way yet).
 */
import { useCallback, useEffect } from 'react'
import { useLocationChoiceStore, type LocationChoice } from '../store/locationChoiceStore'
import { resolveLocation, type ApproxState, type ResolvedLocation } from '../lib/location/resolveLocation'
import type { WeatherCity } from '../lib/cityCatalog'

const GEOLOCATION_TIMEOUT_MS = 8000
const GEOLOCATION_MAX_AGE_MS = 5 * 60 * 1000

export interface UseResolvedLocationResult {
  location: ResolvedLocation | null
  choice: LocationChoice | null
  approx: ApproxState
  requesting: boolean
  denied: boolean
  requestGeolocation: () => void
  selectCity: (city: WeatherCity) => void
  clearChoice: () => void
}

export function useResolvedLocation(): UseResolvedLocationResult {
  const choice = useLocationChoiceStore((s) => s.choice)
  const approx = useLocationChoiceStore((s) => s.approx)
  const loadApprox = useLocationChoiceStore((s) => s.loadApprox)
  const setChoice = useLocationChoiceStore((s) => s.setChoice)
  const clearChoice = useLocationChoiceStore((s) => s.clearChoice)
  const requesting = useLocationChoiceStore((s) => s.requesting)
  const setRequesting = useLocationChoiceStore((s) => s.setRequesting)
  const denied = useLocationChoiceStore((s) => s.denied)
  const setDenied = useLocationChoiceStore((s) => s.setDenied)

  // Idempotent at the store level (`approxRequested`) — safe to call from
  // every mounted consumer without triggering more than one fetch.
  useEffect(() => {
    loadApprox()
  }, [loadApprox])

  const requestGeolocation = useCallback((): void => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDenied(true)
      return
    }
    setRequesting(true)
    setDenied(false)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRequesting(false)
        setChoice({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: 'My location',
          source: 'geolocation',
        })
      },
      () => {
        setRequesting(false)
        setDenied(true)
      },
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS },
    )
  }, [setChoice, setDenied, setRequesting])

  const selectCity = useCallback(
    (city: WeatherCity): void => {
      setDenied(false)
      setChoice({ lat: city.lat, lon: city.lon, label: `${city.name}, ${city.countryCode}`, source: 'search' })
    },
    [setChoice, setDenied],
  )

  return {
    location: resolveLocation(choice, approx),
    choice,
    approx,
    requesting,
    denied,
    requestGeolocation,
    selectCity,
    clearChoice,
  }
}
