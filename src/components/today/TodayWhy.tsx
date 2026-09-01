/**
 * TodayWhy — ② Why. GRID/CAMS/GOOGLE render as three separate cells, never
 * one averaged number (page-specs/today-decision-surface.md §1 principle 1).
 * GOOGLE has no connector yet, so its cell always renders the honest "not
 * connected" void state rather than being omitted — omitting it would look
 * like a source that simply agreed. Below the cells: rule-based observed
 * sentences (wind/humidity/6h trend), with any field that did not resolve
 * named in an UNKNOWN line rather than silently dropped.
 */
import WfSkeleton from '../wireframe/WfSkeleton'
import WfDataState from '../wireframe/WfDataState'
import { sectionDataState } from '../weather/sectionState'
import { describeWind, describeHumidity, describeSixHourTrend } from '../../lib/today/observedConditions'
import { formatUtcTime } from '../../lib/home/whyNow'
import type { TodayGridState } from '../../hooks/useTodayGrid'
import type { TodayCamsState } from '../../hooks/useTodayCams'
import type { OpenMeteoWeatherHourly } from '../../types/forecast'
import type { WeatherPageStatus } from '../../hooks/useWeatherPageData'

export interface TodayWhyProps {
  grid: TodayGridState
  cams: TodayCamsState
  weather: OpenMeteoWeatherHourly | null
  weatherStatus: WeatherPageStatus
  weatherConfigured: boolean
  onRetryWeather: () => void
}

export default function TodayWhy({ grid, cams, weather, weatherStatus, weatherConfigured, onRetryWeather }: TodayWhyProps) {
  const observed: string[] = []
  const unknown: string[] = []

  if (weather) {
    const windLine = describeWind(weather)
    if (windLine) observed.push(windLine)
    else unknown.push('Wind')
    const humidityLine = describeHumidity(weather)
    if (humidityLine) observed.push(humidityLine)
    else unknown.push('Humidity')
  }
  if (cams.status === 'ready') {
    const trend = describeSixHourTrend(cams.series24h)
    if (trend) observed.push(trend)
    else unknown.push('6h trend')
  }

  const weatherState = sectionDataState(weatherStatus, weatherConfigured, weather !== null)

  return (
    <section className="today-why" aria-label="Why">
      <h2 className="today-panel__title m">WHY</h2>

      <div className="today-why__sources">
        <div className="today-cell" data-source="grid">
          <span className="today-cell__label m">PM2.5 GRID</span>
          {grid.status === 'loading' && <WfSkeleton height={48} />}
          {grid.status === 'missing' && <p className="today-cell__void t-caption">No grid coverage for this location.</p>}
          {grid.status === 'ready' && (
            <>
              <span className="today-cell__value t-numeric num">
                {Math.round(grid.pm25)} <small>µg/m³</small>
              </span>
              <span className="today-cell__sub t-micro">
                {grid.stale ? 'stale · ' : ''}analysis · interpolated · valid {formatUtcTime(grid.updatedAt)}
              </span>
            </>
          )}
        </div>

        <div className="today-cell" data-source="cams">
          <span className="today-cell__label m">CAMS FORECAST</span>
          {cams.status === 'loading' && <WfSkeleton height={48} />}
          {cams.status === 'missing' && <p className="today-cell__void t-caption">No forecast coverage for this location.</p>}
          {cams.status === 'ready' && (
            <>
              <span className="today-cell__value t-numeric num">
                {Math.round(cams.current)} <small>µg/m³</small>
              </span>
              <span className="today-cell__sub t-micro">
                forecast · lead +0h · valid {formatUtcTime(cams.series24h[0]?.time ?? cams.updatedAt)}
              </span>
            </>
          )}
        </div>

        <div className="today-cell today-cell--void" data-source="google">
          <span className="today-cell__label m">GOOGLE AQ</span>
          <p className="today-cell__void t-caption">
            Not connected — connector not built — nothing shown is averaged over this gap.
          </p>
        </div>
      </div>

      <div className="today-why__observed">
        {weatherState.kind === 'loading' && <WfSkeleton height={40} />}
        {weatherState.kind !== 'loading' && weatherState.kind !== 'ready' && (
          <WfDataState state={weatherState} onRetry={weatherState.kind === 'error' ? onRetryWeather : undefined} variant="inline" />
        )}
        {observed.length > 0 && (
          <ul className="today-why__observed-list t-caption">
            {observed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {unknown.length > 0 && <p className="today-why__unknown t-micro">UNKNOWN — {unknown.join(', ')}</p>}
      </div>
    </section>
  )
}
