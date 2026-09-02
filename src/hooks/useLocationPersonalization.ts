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
 */
import { useCallback, useState } from 'react'
import { useLocationChoiceStore, type LocationChoice } from '../store/locationChoiceStore'
import type { WeatherCity } from '../lib/cityCatalog'

const GEOLOCATION_TIMEOUT_MS = 8000
const GEOLOCATION_MAX_AGE_MS = 5 * 60 * 1000

export interface UseLocationPersonalizationResult {
  choice: LocationChoice | null
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

  return { choice, requesting, denied, requestGeolocation, selectCity, clearChoice }
}
