import { useState } from 'react'
import Materialize from '../fluid/Materialize'
import WfSkeleton from '../wireframe/WfSkeleton'
import WfDataState from '../wireframe/WfDataState'
import CitySearch from './CitySearch'
import WeatherHeroRail from './WeatherHeroRail'
import { sectionDataState } from './sectionState'
import { skyPhaseForWeatherAt } from '../../lib/skyPhase'
import { weatherCodeToCondition, WEATHER_CONDITION_LABEL } from '../../lib/weatherCondition'
import { useReducedMotion } from '../../landing/shared/perf/useReducedMotion'
import {
  DENIED_NOTICE,
  LOCATING_LABEL,
  SEOUL_DEFAULT,
  type LocationSource,
  type ResolvedLocation,
} from '../../lib/location/resolveLocation'
import type { WeatherPageStatus } from '../../hooks/useWeatherPageData'
import type { OpenMeteoWeatherHourly } from '../../types/forecast'
import type { WeatherCity } from '../../lib/cityCatalog'
import type { PrimaryReading } from '../../lib/reading/resolvePrimaryReading'

export interface WeatherHeroProps {
  /** `null` while the location is still resolving — the place row shows
   * `LOCATING_LABEL` with no source badge. */
  location: ResolvedLocation | null
  requestingLocation: boolean
  locationDenied: boolean
  onRequestLocation: () => void
  onSelectCity: (city: WeatherCity) => void
  status: WeatherPageStatus
  configured: boolean
  weather: OpenMeteoWeatherHourly | null
  /** The shared headline resolver's result (W1b commit ③), for the S1
   * instrument rail's "PM2.5 now" tile — the same reading the HUD, Home and
   * the capsule show. */
  reading: PrimaryReading
  onRetry: () => void
}

function finiteMinMax(values: (number | null | undefined)[] | undefined): { min: number | null; max: number | null } {
  if (!values) return { min: null, max: null }
  let min: number | null = null
  let max: number | null = null
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue
    if (min === null || v < min) min = v
    if (max === null || v > max) max = v
  }
  return { min, max }
}

function round(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) ? null : Math.round(v)
}

/** `location.label` sometimes carries a parenthetical that restates exactly
 * what the mono-caps `.wx-hero__place-source` badge right next to it already
 * says — "Suwon (approximate, IP-based)" beside an APPROXIMATE LOCATION
 * badge, or "Seoul (default)" beside DEFAULT LOCATION (label diet, design-
 * audit 2026-09-05: the same fact stated twice in the hero's top row).
 * Stripping the trailing parenthetical here is display-only — the
 * underlying `location.label` value (from `useResolvedLocation`) is
 * untouched, so anything else reading it (CitySearch, capsule, etc.) still
 * sees the full string. */
function displayPlaceName(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '')
}

const PLACE_SOURCE_LABEL: Record<LocationSource, string> = {
  geolocation: 'MY LOCATION',
  search: 'CHOSEN LOCATION',
  approx: 'APPROXIMATE LOCATION',
  default: 'DEFAULT LOCATION · NOT YOURS',
}

/**
 * WeatherHero — S1. Sky-glass backdrop (11-phase gradient, F2) with the
 * current reading and location controls. The site's floating AqiCapsule
 * (its own independent "featured city" data source — see docs/FLUID.md) is
 * no longer embedded here: `/weather` is wrapped in the same `FluidChrome`
 * overlay as `/landing` and `/globe`, so a second, hero-anchored instance
 * would double it up. S4 owns the location-specific PM2.5 reading.
 */
export default function WeatherHero({
  location,
  requestingLocation,
  locationDenied,
  onRequestLocation,
  onSelectCity,
  status,
  configured,
  weather,
  reading,
  onRetry,
}: WeatherHeroProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const reducedMotion = useReducedMotion()

  const weatherCode = weather?.weather_code?.[0] ?? null
  // Before the location resolves there is no weather code either, so the phase
  // only needs a stable clock longitude; Seoul's matches the pre-W1a first paint.
  const phase = skyPhaseForWeatherAt(weatherCode, location?.lon ?? SEOUL_DEFAULT.lon)
  const condition = weatherCodeToCondition(weatherCode)

  const temp = round(weather?.temperature_2m?.[0])
  const feels = round(weather?.apparent_temperature?.[0])
  const { min: lo, max: hi } = finiteMinMax(weather?.temperature_2m)
  const uvIndexNow = round(weather?.uv_index?.[0])

  const state = sectionDataState(status, configured, weather !== null)

  return (
    <section className="wx-sky" data-sky-phase={phase} aria-label="Current weather">
      <div className="wx-hero__inner">
        <div className="wx-hero__top">
          <div className="wx-hero__place">
            <span className="wx-hero__place-name">{location ? displayPlaceName(location.label) : LOCATING_LABEL}</span>
            {location && <span className="wx-hero__place-source">{PLACE_SOURCE_LABEL[location.source]}</span>}
          </div>
          <div className="wx-hero__actions">
            <button
              type="button"
              className="wx-hero__action-btn"
              onClick={onRequestLocation}
              disabled={requestingLocation}
            >
              {requestingLocation ? 'Locating…' : 'Use my location'}
            </button>
            <button
              type="button"
              className="wx-hero__action-btn"
              onClick={() => setSearchOpen((v) => !v)}
              aria-expanded={searchOpen}
            >
              Search city
            </button>
          </div>
        </div>

        {locationDenied && (
          <p className="wx-hero__place-source" style={{ marginTop: 8 }}>
            {DENIED_NOTICE[location?.source ?? 'geolocation']}
          </p>
        )}

        <Materialize show={searchOpen} origin="top right">
          <CitySearch
            onSelect={(city) => {
              onSelectCity(city)
              setSearchOpen(false)
            }}
          />
        </Materialize>

        {state.kind === 'loading' && (
          <div className="wx-hero__reading" aria-busy="true">
            <WfSkeleton width={220} height={110} />
            <WfSkeleton width={160} height={40} />
          </div>
        )}
        {state.kind !== 'loading' && state.kind !== 'ready' && (
          <div style={{ marginTop: 24 }}>
            <WfDataState state={state} onRetry={state.kind === 'error' ? onRetry : undefined} />
          </div>
        )}
        {state.kind === 'ready' && (
          <div className="wx-hero__band">
            <div className="wx-hero__reading">
              <div className={reducedMotion ? 'wx-hero__temp-mask' : 'wx-hero__temp-mask motion-reveal-mask'}>
                <div className="wx-hero__temp">
                  {temp ?? '—'}
                  <span className="wx-hero__temp-unit">°</span>
                </div>
              </div>
              <div className="wx-hero__meta">
                <span className="wx-hero__condition">{WEATHER_CONDITION_LABEL[condition]}</span>
                <span className="wx-hero__range">
                  Feels like {feels ?? '—'}° · High {hi ?? '—'}° Low {lo ?? '—'}°
                </span>
              </div>
            </div>
            <WeatherHeroRail
              hourlyTemp={weather?.temperature_2m}
              reading={reading}
              uvIndexNow={uvIndexNow}
              reducedMotion={reducedMotion}
            />
          </div>
        )}
      </div>
    </section>
  )
}
