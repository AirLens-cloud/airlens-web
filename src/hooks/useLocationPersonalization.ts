/**
 * useLocationPersonalization — the opt-in "show me my own air, not the
 * world's worst" flow (Home hero fallback-band CTAs, UI Tier-1 P1-B).
 *
 * Wraps `useLocationChoiceStore` so every consumer (Home hero, AqiCapsule via
 * FluidChrome) reads/writes the same shared choice. No auto-prompt —
 * `requestGeolocation()` must fire from a user gesture. A denial or missing
 * `navigator.geolocation` sets `denied`, which the caller uses to reveal the
 * city-search fallback (`CitySearch`, already used by `/today`'s
 * `WeatherHero`) rather than silently doing nothing.
 *
 * `approx` is a separate value, not folded into `choice` — the store's
 * "`choice` stays `null` until a real request/pick" invariant (see
 * `locationChoiceStore.ts`'s header) is deliberately untouched here. A
 * caller that wants "the best location we have" resolves its own
 * `choice ?? approx` priority (Home hero does this explicitly, so it can
 * still tell the visitor a reading is only approximate).
 */
import { useCallback, useEffect, useState } from 'react'
import { useLocationChoiceStore, type LocationChoice } from '../store/locationChoiceStore'
import { getApproxLocation, type ApproxLocation } from '../lib/geo/approxLocation'
import type { WeatherCity } from '../lib/cityCatalog'

const GEOLOCATION_TIMEOUT_MS = 8000
const GEOLOCATION_MAX_AGE_MS = 5 * 60 * 1000

export interface UseLocationPersonalizationResult {
  choice: LocationChoice | null
  /** The edge's IP-approximate location, or `null` until it resolves (or
   * fails). Independent of `choice` — still populated even after a real
   * pick lands, so a later `clearChoice()` has an immediate fallback. */
  approx: ApproxLocation | null
  requesting: boolean
  denied: boolean
  requestGeolocation: () => void
  selectCity: (city: WeatherCity) => void
  clearChoice: () => void
}

export function useLocationPersonalization(): UseLocationPersonalizationResult {
  const choice = useLocationChoiceStore((s) => s.choice)
  const setChoice = useLocationChoiceStore((s) => s.setChoice)
  const clearChoice = useLocationChoiceStore((s) => s.clearChoice)
  const [requesting, setRequesting] = useState(false)
  const [denied, setDenied] = useState(false)
  const [approx, setApprox] = useState<ApproxLocation | null>(null)

  useEffect(() => {
    let alive = true
    getApproxLocation().then((result) => {
      if (alive) setApprox(result)
    })
    return () => {
      alive = false
    }
  }, [])

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
  }, [setChoice])

  const selectCity = useCallback(
    (city: WeatherCity): void => {
      setDenied(false)
      setChoice({ lat: city.lat, lon: city.lon, label: `${city.name}, ${city.countryCode}`, source: 'search' })
    },
    [setChoice],
  )

  return { choice, approx, requesting, denied, requestGeolocation, selectCity, clearChoice }
}
