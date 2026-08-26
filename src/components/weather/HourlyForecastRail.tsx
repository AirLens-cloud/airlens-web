import WfSkeleton from '../wireframe/WfSkeleton'
import WfDataState from '../wireframe/WfDataState'
import { sectionDataState } from './sectionState'
import { weatherCodeToCondition, type WeatherCondition } from '../../lib/weatherCondition'
import type { WeatherPageStatus } from '../../hooks/useWeatherPageData'
import type { OpenMeteoWeatherHourly } from '../../types/forecast'

export interface HourlyForecastRailProps {
  status: WeatherPageStatus
  configured: boolean
  weather: OpenMeteoWeatherHourly | null
  onRetry: () => void
}

const CONDITION_ABBR: Record<WeatherCondition, string> = {
  clear: 'CLR',
  cloudy: 'CLD',
  fog: 'FOG',
  drizzle: 'DRZ',
  rain: 'RN',
  snow: 'SNW',
  thunder: 'TSTM',
}

/**
 * The proxy's hourly payload is index-aligned to the *location's* local wall
 * clock (Open-Meteo's `timezone=auto`), not the viewer's. Extract HH:MM
 * directly from the ISO string rather than routing it through `Date` —
 * doing so would silently reinterpret the hour in the viewer's own
 * timezone.
 */
function formatHourLabel(iso: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(iso)
  return match ? `${match[1]}:${match[2]}` : '—'
}

/**
 * HourlyForecastRail — S2. Horizontal-scroll 24h rail: time (location-local),
 * condition, temperature, precipitation probability (only shown >=10%).
 */
export default function HourlyForecastRail({ status, configured, weather, onRetry }: HourlyForecastRailProps) {
  const state = sectionDataState(status, configured, weather !== null && weather.time.length > 0)

  return (
    <section className="wx-section" aria-label="Hourly forecast">
      <div className="wx-section__head">
        <span className="t-tag">Hourly forecast</span>
      </div>

      {state.kind === 'loading' && (
        <div className="wx-skeleton-row" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <WfSkeleton key={i} width={76} height={96} />
          ))}
        </div>
      )}
      {state.kind !== 'loading' && state.kind !== 'ready' && (
        <WfDataState state={state} onRetry={state.kind === 'error' ? onRetry : undefined} />
      )}
      {state.kind === 'ready' && weather && (
        <div className="wx-rail">
          {weather.time.map((t, i) => {
            const code = weather.weather_code?.[i] ?? null
            const condition = weatherCodeToCondition(code)
            const temp = weather.temperature_2m?.[i]
            const precip = weather.precipitation_probability?.[i]
            const hasTemp = temp != null && Number.isFinite(temp)
            const hasPrecip = precip != null && Number.isFinite(precip) && precip >= 10
            return (
              <div key={t} className="wx-rail__item">
                <span className="wx-rail__time">{formatHourLabel(t)}</span>
                <span className="wx-rail__icon t-micro" aria-hidden="true">
                  {CONDITION_ABBR[condition]}
                </span>
                <span className="wx-rail__temp">{hasTemp ? `${Math.round(temp)}°` : '—'}</span>
                {hasPrecip && <span className="wx-rail__precip">{Math.round(precip)}%</span>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
