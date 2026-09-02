/**
 * Today — `/today`, the briefing surface (page-specs/today-decision-surface.md,
 * re-cut under Weather Storyboard v3 — Wave 2A). `WeatherHero` (ported from
 * the former `/weather` page) is now permanently on-screen: the sky-glass
 * temperature reading + location controls that used to live in this file's
 * own toolbar. Below it, two tabs: Conditions (default) — the former
 * `/weather` page's instrument sections, sharing one `useWeatherPageData`
 * fetch — and Insight (secondary) — the PM2.5 decision content (HUD, Answer,
 * Why/What next, Evidence) that used to be this page's default view,
 * demoted to an embedded dark instrument panel (`.today-insight.obs-surface`
 * — the obs tokens are class-scoped, so isolating just this panel is safe
 * even though the page body around it is now paper).
 *
 * `/weather` still redirects here with `?tab=conditions` (App.tsx shim);
 * a stray `?tab=decision` (the tab's old name) maps to Insight for
 * backward compatibility.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useGeolocation } from '../hooks/useGeolocation'
import { useWeatherPageData } from '../hooks/useWeatherPageData'
import { useTodayGrid } from '../hooks/useTodayGrid'
import { useTodayCams } from '../hooks/useTodayCams'
import { tierFromPm25 } from '../components/fluid/capsule/useCapsuleData'
import { computeSourceAgreement } from '../lib/today/sourceAgreement'
import WfSegmented from '../components/wireframe/WfSegmented'
import TrustLine from '../components/wireframe/TrustLine'
import WeatherHero from '../components/weather/WeatherHero'
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
import '../styles/weather.css'
import '../styles/today.css'

export type TodayTab = 'insight' | 'conditions'

/** Read once on mount. `?tab=conditions` is the `/weather` redirect shim's
 * pre-selection; a stray `?tab=decision` (the tab's pre-Wave-2A name) maps
 * to Insight for backward compatibility. Conditions is the default. */
function initialTab(): TodayTab {
  if (typeof window === 'undefined') return 'conditions'
  const tab = new URLSearchParams(window.location.search).get('tab')
  return tab === 'decision' || tab === 'insight' ? 'insight' : 'conditions'
}

export default function Today() {
  const [tab, setTab] = useState<TodayTab>(initialTab)
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

  // UI Tier-1 P3-B: same DQSS/p10-p90 honesty split as `useCapsuleData` —
  // GRID (`gridSnapshot.ts`) carries a real `dqss` when the source artifact
  // has one but never a p10/p90 band; CAMS (`forecastSource.ts`) is the
  // reverse (band per hour, no DQSS at all). Never conflate the two sources'
  // withheld reasons into one line.
  const trustDqss =
    primaryIsGrid && grid.status === 'ready' && grid.dqss !== undefined
      ? { available: true as const, value: grid.dqss }
      : {
          available: false as const,
          reason: primaryIsGrid ? 'not measured for this grid cell' : 'not measured for forecast-sourced readings',
        }
  const camsP10 = cams.status === 'ready' ? cams.series24h[0]?.p10 : null
  const camsP90 = cams.status === 'ready' ? cams.series24h[0]?.p90 : null
  const trustUncertainty =
    !primaryIsGrid && camsP10 != null && camsP90 != null
      ? { available: true as const, p10: camsP10, p90: camsP90, unit: 'µg/m³' }
      : {
          available: false as const,
          reason: primaryIsGrid
            ? 'this data source publishes no uncertainty range'
            : "this forecast doesn't publish a range",
        }

  return (
    <main className="today-page">
      <div className="fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>
        <WeatherHero
          location={location}
          requestingLocation={requesting}
          locationDenied={denied}
          onRequestLocation={requestLocation}
          onSelectCity={handleSelectCity}
          status={weatherData.status}
          configured={weatherData.configured}
          weather={weatherData.weather}
          onRetry={weatherData.retry}
        />
        {primaryPm25 !== null && (
          <TrustLine
            ageMs={updatedAgeMs}
            dqss={trustDqss}
            uncertainty={trustUncertainty}
            className="today-hero__trust-line"
          />
        )}
      </div>

      <div className="today-toolbar fluid-enter" style={{ '--enter-i': 1 } as CSSProperties}>
        <WfSegmented
          ariaLabel="Today view"
          activeKey={tab}
          onChange={(key) => setTab(key as TodayTab)}
          items={[
            { key: 'conditions', label: 'Conditions' },
            { key: 'insight', label: 'Insight' },
          ]}
        />
      </div>

      {tab === 'insight' && (
        <div className="today-insight obs-surface fluid-enter" style={{ '--enter-i': 2 } as CSSProperties}>
          <TodayHud
            status={hudStatus}
            city={primaryCity}
            countryCode={primaryCountryCode}
            validTimeMs={validTimeMs}
            updatedAgeMs={updatedAgeMs}
            natureLabel={natureLabel}
          />
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
        </div>
      )}

      {tab === 'conditions' && (
        <div className="today-conditions wx-shell fluid-enter" style={{ '--enter-i': 2 } as CSSProperties}>
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
