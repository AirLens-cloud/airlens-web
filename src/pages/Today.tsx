/**
 * Today — `/today`, the Decision surface
 * (page-specs/today-decision-surface.md). Decision tab (default): Answer ->
 * Why -> What next -> Evidence, all fed by one chosen location
 * (`useGeolocation`, ported from the former `/weather` page). Conditions
 * tab: the former `/weather` page's instrument sections, sharing the same
 * `useWeatherPageData` fetch rather than a second copy (§14 #4 — "공유
 * 확정"). `WeatherHero` is deliberately excluded from Conditions — Answer
 * (Decision tab) replaces it as the page's single current-reading hero.
 *
 * `/weather` now redirects here with `?tab=conditions` (App.tsx shim) so
 * returning visitors land on the tab they expect.
 */
import { useMemo, useState } from 'react'
import { useGeolocation } from '../hooks/useGeolocation'
import { useWeatherPageData } from '../hooks/useWeatherPageData'
import { useTodayGrid } from '../hooks/useTodayGrid'
import { useTodayCams } from '../hooks/useTodayCams'
import { tierFromPm25 } from '../components/fluid/capsule/useCapsuleData'
import { computeSourceAgreement } from '../lib/today/sourceAgreement'
import WfSegmented from '../components/wireframe/WfSegmented'
import Materialize from '../components/fluid/Materialize'
import CitySearch from '../components/weather/CitySearch'
import TodayHud, { type TodayHudStatus } from '../components/today/TodayHud'
import TodayAnswer from '../components/today/TodayAnswer'
import TodayWhy from '../components/today/TodayWhy'
import TodayWhatNext from '../components/today/TodayWhatNext'
import TodayEvidence from '../components/today/TodayEvidence'
import HourlyForecastRail from '../components/weather/HourlyForecastRail'
import InstrumentGrid from '../components/weather/InstrumentGrid'
import AirQualityLine from '../components/weather/AirQualityLine'
import WindMinimap from '../components/weather/WindMinimap'
import SourceFooter from '../components/weather/SourceFooter'
import type { WeatherCity } from '../lib/cityCatalog'
import '../styles/today.css'

export type TodayTab = 'decision' | 'conditions'

/** Read once on mount — `?tab=conditions` is how the `/weather` redirect
 * shim opens Today with its Conditions tab pre-selected. */
function initialTab(): TodayTab {
  if (typeof window === 'undefined') return 'decision'
  return new URLSearchParams(window.location.search).get('tab') === 'conditions' ? 'conditions' : 'decision'
}

export default function Today() {
  const [tab, setTab] = useState<TodayTab>(initialTab)
  const [searchOpen, setSearchOpen] = useState(false)
  // Read once, in a lazy initializer (React's documented escape hatch for a
  // one-time non-deterministic read) rather than calling `Date.now()`
  // directly in the render body, which the purity lint rule rejects — same
  // pattern as `Home.tsx`'s `renderedAtMs`.
  const [nowMs] = useState(() => Date.now())
  const { location, requesting, denied, requestLocation, setLocation } = useGeolocation()
  const weatherData = useWeatherPageData(location.lat, location.lon)
  const grid = useTodayGrid(location.lat, location.lon)
  const cams = useTodayCams(location.lat, location.lon)

  function handleSelectCity(city: WeatherCity): void {
    setLocation({ lat: city.lat, lon: city.lon, label: `${city.name}, ${city.countryCode}` })
    setSearchOpen(false)
  }

  const gridPm25 = grid.status === 'ready' ? grid.pm25 : null
  const camsPm25 = cams.status === 'ready' ? cams.current : null
  // GRID (an analysis snapshot for this exact coordinate) is preferred over
  // CAMS (a forecast resolved to the nearest feed city) as the primary
  // reading when both are present.
  const primaryPm25 = gridPm25 ?? camsPm25
  const primaryTier = primaryPm25 !== null ? tierFromPm25(primaryPm25) : 'unknown'

  const agreement = useMemo(() => computeSourceAgreement(gridPm25, camsPm25), [gridPm25, camsPm25])

  let agreeCount = 0
  let resolvedCount = 0
  if (grid.status === 'ready') {
    resolvedCount += 1
    if (tierFromPm25(grid.pm25) === primaryTier) agreeCount += 1
  }
  if (cams.status === 'ready') {
    resolvedCount += 1
    if (cams.tier === primaryTier) agreeCount += 1
  }

  // Whichever source backs the primary reading also decides staleness — a
  // GRID-primary reading checks `grid.stale`, a CAMS-primary reading (GRID
  // missing/loading, CAMS filled in) must check `cams.stale` instead, or a
  // stale forecast-fallback bundle (`forecastSource.ts`'s "may be stale"
  // static fallback) would render as unconditionally "ready".
  const primaryIsGrid = grid.status === 'ready'
  const primaryStale = primaryIsGrid ? grid.stale : cams.status === 'ready' ? cams.stale === true : false
  const hudStatus: TodayHudStatus =
    primaryPm25 !== null
      ? primaryStale
        ? 'stale'
        : 'ready'
      : grid.status === 'loading' || cams.status === 'loading'
        ? 'loading'
        : 'unavailable'

  const validTimeMs =
    grid.status === 'ready'
      ? new Date(grid.updatedAt).getTime()
      : cams.status === 'ready' && cams.series24h[0]
        ? new Date(cams.series24h[0].time).getTime()
        : null
  const updatedAgeMs =
    grid.status === 'ready'
      ? nowMs - new Date(grid.updatedAt).getTime()
      : cams.status === 'ready'
        ? nowMs - new Date(cams.updatedAt).getTime()
        : null
  const natureLabel = grid.status === 'ready' ? '[ANALYSIS]' : cams.status === 'ready' ? '[FORECAST]' : '[NO DATA]'
  const primaryCity = grid.status === 'ready' ? location.label : cams.status === 'ready' ? cams.cityName : location.label
  const primaryCountryCode = cams.status === 'ready' ? cams.countryCode : null
  const primaryDistanceKm = grid.status === 'ready' ? grid.distanceKm : cams.status === 'ready' ? cams.distanceKm : null
  const validTimeIso =
    grid.status === 'ready' ? grid.updatedAt : cams.status === 'ready' ? (cams.series24h[0]?.time ?? cams.updatedAt) : null

  return (
    <main className="obs-surface today-page">
      <TodayHud
        status={hudStatus}
        city={primaryCity}
        countryCode={primaryCountryCode}
        validTimeMs={validTimeMs}
        updatedAgeMs={updatedAgeMs}
        natureLabel={natureLabel}
      />

      <div className="today-toolbar">
        <WfSegmented
          ariaLabel="Today view"
          activeKey={tab}
          onChange={(key) => setTab(key as TodayTab)}
          items={[
            { key: 'decision', label: 'Decision' },
            { key: 'conditions', label: 'Conditions' },
          ]}
        />
        <div className="today-location">
          <span className="today-location__label t-micro">{location.label}</span>
          <button type="button" className="today-location__btn" onClick={requestLocation} disabled={requesting}>
            {requesting ? 'Locating…' : 'Use my location'}
          </button>
          <button
            type="button"
            className="today-location__btn"
            onClick={() => setSearchOpen((v) => !v)}
            aria-expanded={searchOpen}
          >
            Search city
          </button>
        </div>
      </div>

      {denied && (
        <p className="today-location__denied t-micro">Location permission was not granted — showing the default location.</p>
      )}

      <Materialize show={searchOpen} origin="top right">
        <CitySearch onSelect={handleSelectCity} />
      </Materialize>

      {tab === 'decision' && (
        <div className="today-decision">
          <TodayAnswer
            tier={primaryTier}
            pm25={primaryPm25}
            city={primaryCity}
            countryCode={primaryCountryCode}
            validTimeIso={validTimeIso}
            distanceKm={primaryDistanceKm}
          />
          <div className="today-decision__row">
            <TodayWhy
              grid={grid}
              cams={cams}
              weather={weatherData.weather}
              weatherStatus={weatherData.status}
              weatherConfigured={weatherData.configured}
              onRetryWeather={weatherData.retry}
            />
            <TodayWhatNext tier={primaryTier} agreeCount={agreeCount} resolvedCount={resolvedCount} />
          </div>
          <TodayEvidence grid={grid} cams={cams} agreement={agreement} />
        </div>
      )}

      {tab === 'conditions' && (
        <div className="today-conditions wx-shell">
          <HourlyForecastRail
            status={weatherData.status}
            configured={weatherData.configured}
            weather={weatherData.weather}
            onRetry={weatherData.retry}
          />
          <InstrumentGrid
            status={weatherData.status}
            configured={weatherData.configured}
            weather={weatherData.weather}
            onRetry={weatherData.retry}
          />
          <AirQualityLine
            status={weatherData.status}
            configured={weatherData.configured}
            aq={weatherData.aq}
            onRetry={weatherData.retry}
          />
          <WindMinimap
            status={weatherData.status}
            configured={weatherData.configured}
            wind={weatherData.wind}
            mslp={weatherData.mslp}
            lat={location.lat}
            lon={location.lon}
            onRetry={weatherData.retry}
          />
          <SourceFooter fetchedAt={weatherData.fetchedAt} locationSource={location.source} />
        </div>
      )}
    </main>
  )
}
