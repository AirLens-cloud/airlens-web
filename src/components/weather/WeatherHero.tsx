import { useState } from 'react'
import Materialize from '../fluid/Materialize'
import WfSkeleton from '../wireframe/WfSkeleton'
import WfDataState from '../wireframe/WfDataState'
import CitySearch from './CitySearch'
import { sectionDataState } from './sectionState'
import { skyPhaseForWeatherAt } from '../../lib/skyPhase'
import { weatherCodeToCondition, WEATHER_CONDITION_LABEL } from '../../lib/weatherCondition'
import type { GeoLocationState } from '../../hooks/useGeolocation'
import type { WeatherPageStatus } from '../../hooks/useWeatherPageData'
import type { OpenMeteoWeatherHourly } from '../../types/forecast'
import type { WeatherCity } from '../../lib/cityCatalog'

export interface WeatherHeroProps {
  location: GeoLocationState
  requestingLocation: boolean
  locationDenied: boolean
  onRequestLocation: () => void
  onSelectCity: (city: WeatherCity) => void
  status: WeatherPageStatus
  configured: boolean
  weather: OpenMeteoWeatherHourly | null
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
  onRetry,
}: WeatherHeroProps) {
  const [searchOpen, setSearchOpen] = useState(false)

  const weatherCode = weather?.weather_code?.[0] ?? null
  const phase = skyPhaseForWeatherAt(weatherCode, location.lon)
  const condition = weatherCodeToCondition(weatherCode)

  const temp = round(weather?.temperature_2m?.[0])
  const feels = round(weather?.apparent_temperature?.[0])
  const { min: lo, max: hi } = finiteMinMax(weather?.temperature_2m)

  const state = sectionDataState(status, configured, weather !== null)

  return (
    <section className="wx-sky" data-sky-phase={phase} aria-label="Current weather">
      <div className="wx-hero__inner">
        <div className="wx-hero__top">
          <div className="wx-hero__place">
            <span className="wx-hero__place-name">{location.label}</span>
            <span className="wx-hero__place-source">
              {location.source === 'user' ? 'CHOSEN LOCATION' : 'DEFAULT LOCATION'}
            </span>
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
            Location permission was not granted — showing the default location.
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
          <div className="wx-hero__reading">
            <div className="wx-hero__temp">
              {temp ?? '—'}
              <span className="wx-hero__temp-unit">°</span>
            </div>
            <div className="wx-hero__meta">
              <span className="wx-hero__condition">{WEATHER_CONDITION_LABEL[condition]}</span>
              <span className="wx-hero__range">
                Feels like {feels ?? '—'}° · High {hi ?? '—'}° Low {lo ?? '—'}°
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
