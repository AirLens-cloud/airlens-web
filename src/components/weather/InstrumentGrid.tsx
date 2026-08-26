import WfSkeleton from '../wireframe/WfSkeleton'
import WfDataState from '../wireframe/WfDataState'
import { sectionDataState } from './sectionState'
import type { WeatherPageStatus } from '../../hooks/useWeatherPageData'
import type { OpenMeteoWeatherHourly } from '../../types/forecast'

export interface InstrumentGridProps {
  status: WeatherPageStatus
  configured: boolean
  weather: OpenMeteoWeatherHourly | null
  onRetry: () => void
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

function compassLabel(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8
  return COMPASS[idx]
}

function uvGrade(uv: number): string {
  if (uv < 3) return 'Low'
  if (uv < 6) return 'Moderate'
  if (uv < 8) return 'High'
  if (uv < 11) return 'Very High'
  return 'Extreme'
}

function toFinite(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null
}

/** Open-Meteo's `wind_speed_10m` is served in km/h by default (confirmed via
 * the proxy's own `hourly_units.wind_speed_10m`), not m/s — this repo shows
 * m/s to match Korean weather convention, so every reading is converted here
 * rather than displayed raw. */
function windSpeedMsFromKmh(kmh: number): number {
  return kmh / 3.6
}

/** `wind_direction_10m` is meteorological convention (degrees the wind is
 * blowing FROM). The compass arrow follows the common consumer-weather-app
 * convention instead — pointing in the direction the wind is blowing
 * TOWARD — so the rotation is the reciprocal bearing. */
function arrowRotationDegFromMeteorological(directionFromDeg: number): number {
  return (directionFromDeg + 180) % 360
}

interface TileSpec {
  label: string
  value: string
  sub: string
  /** Decorative compass arrow rotation (degrees), Wind tile only. */
  arrowDeg?: number | null
}

/** One instrument tile — fail-soft per field: a null value renders "—" plus
 * a caption, never a fabricated 0, and never collapses the tile (no layout
 * jump — every tile keeps the same footprint whether the field resolved). */
function Tile({ label, value, sub, arrowDeg }: TileSpec) {
  return (
    <div className="wx-tile">
      <span className="wx-tile__label">{label}</span>
      <div className="wx-tile__value-row">
        <span className="wx-tile__value">{value}</span>
        {arrowDeg != null && Number.isFinite(arrowDeg) && (
          <span
            className="wx-tile__arrow"
            aria-hidden="true"
            style={{ transform: `rotate(${arrowDeg}deg)` }}
          >
            &uarr;
          </span>
        )}
      </div>
      <span className="wx-tile__sub">{sub}</span>
    </div>
  )
}

function buildTiles(weather: OpenMeteoWeatherHourly): TileSpec[] {
  const humidity = toFinite(weather.relative_humidity_2m?.[0])
  const windSpeedKmh = toFinite(weather.wind_speed_10m?.[0])
  const windSpeedMs = windSpeedKmh !== null ? windSpeedMsFromKmh(windSpeedKmh) : null
  const windDirection = toFinite(weather.wind_direction_10m?.[0])
  const uv = toFinite(weather.uv_index?.[0])
  const cloud = toFinite(weather.cloud_cover?.[0])
  const precip = toFinite(weather.precipitation_probability?.[0])
  const feelsLike = toFinite(weather.apparent_temperature?.[0])

  return [
    { label: 'Humidity', value: humidity !== null ? `${Math.round(humidity)}%` : '—', sub: humidity !== null ? 'relative' : 'Not measured' },
    {
      label: 'Wind',
      value: windSpeedMs !== null ? `${windSpeedMs.toFixed(1)} m/s` : '—',
      sub: windSpeedMs === null ? 'Not measured' : windDirection !== null ? compassLabel(windDirection) : 'direction unavailable',
      arrowDeg: windDirection !== null ? arrowRotationDegFromMeteorological(windDirection) : null,
    },
    { label: 'UV Index', value: uv !== null ? uv.toFixed(1) : '—', sub: uv !== null ? uvGrade(uv) : 'Not measured' },
    { label: 'Cloud cover', value: cloud !== null ? `${Math.round(cloud)}%` : '—', sub: cloud !== null ? 'sky coverage' : 'Not measured' },
    { label: 'Precip. chance', value: precip !== null ? `${Math.round(precip)}%` : '—', sub: precip !== null ? 'next hour' : 'Not measured' },
    { label: 'Feels like', value: feelsLike !== null ? `${Math.round(feelsLike)}°` : '—', sub: feelsLike !== null ? 'apparent temperature' : 'Not measured' },
  ]
}

/**
 * InstrumentGrid — S3. 2x3 grid: humidity, wind, UV, cloud cover,
 * precipitation probability, apparent temperature. `wind_direction_10m` is a
 * mid-rollout proxy field — absent means speed-only, not a broken tile.
 */
export default function InstrumentGrid({ status, configured, weather, onRetry }: InstrumentGridProps) {
  const state = sectionDataState(status, configured, weather !== null)

  return (
    <section className="wx-section" aria-label="Instruments">
      <div className="wx-section__head">
        <span className="t-tag">Instruments</span>
      </div>

      {state.kind === 'loading' && (
        <div className="wx-grid" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <WfSkeleton key={i} height={92} />
          ))}
        </div>
      )}
      {state.kind !== 'loading' && state.kind !== 'ready' && (
        <WfDataState state={state} onRetry={state.kind === 'error' ? onRetry : undefined} />
      )}
      {state.kind === 'ready' && weather && (
        <div className="wx-grid">
          {buildTiles(weather).map((tile) => (
            <Tile key={tile.label} {...tile} />
          ))}
        </div>
      )}
    </section>
  )
}
