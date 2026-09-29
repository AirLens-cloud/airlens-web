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
import { useState, type CSSProperties } from 'react'
import { useResolvedLocation } from '../hooks/useResolvedLocation'
import { useWeatherPageData } from '../hooks/useWeatherPageData'
import { usePrimaryReading } from '../hooks/usePrimaryReading'
import { useNow } from '../hooks/useNow'
import { LOCATING_LABEL, SEOUL_DEFAULT } from '../lib/location/resolveLocation'
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
  // A ticking clock (GNET1), not a mount-time snapshot — the TrustLine's data
  // age and the HUD's "Updated … ago" keep growing while the tab stays open.
  const nowMs = useNow()
  const { location, requesting, denied, requestGeolocation, selectCity } = useResolvedLocation()
  const weatherData = useWeatherPageData(location?.lat ?? null, location?.lon ?? null)
  const { reading, grid, cams } = usePrimaryReading(location, nowMs)

  // Every line below reads `reading` (the resolved primary), never `grid`/
  // `cams` directly — `resolvePrimaryReading` (`lib/reading/`) already
  // decided which source backs the headline (an unverifiable GRID cell hands
  // it to CAMS) and computed everything derived from that choice. `grid`/
  // `cams` themselves are still passed through below, unchanged, to
  // TodayWhy/TodayEvidence — those panels render both raw sources
  // side by side regardless of which one is primary.
  const ready = reading.status === 'ready' ? reading : null
  const hudStatus: TodayHudStatus = ready ? ready.hudStatus : reading.status === 'loading' ? 'loading' : 'unavailable'
  const primaryTier = ready?.tier ?? 'unknown'
  const primaryPm25 = ready?.pm25 ?? null
  const placeLabel = location?.label ?? LOCATING_LABEL
  const primaryCity = ready?.place.label ?? placeLabel
  const primaryCountryCode = ready?.place.countryCode ?? null
  const primaryDistanceKm = ready?.place.distanceKm ?? null
  const validTimeMs = ready?.validTimeMs ?? null
  const updatedAgeMs = ready?.ageMs ?? null
  const validTimeIso = ready?.validTimeIso ?? null
  const natureLabel = ready?.natureLabel ?? '[NO DATA]'
  const agreeCount = ready?.agreeCount ?? 0
  const resolvedCount = ready?.resolvedCount ?? 0
  const agreement = ready?.agreement ?? null

  return (
    <main className="today-page">
      <div className="fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>
        <WeatherHero
          location={location}
          requestingLocation={requesting}
          locationDenied={denied}
          onRequestLocation={requestGeolocation}
          onSelectCity={selectCity}
          status={weatherData.status}
          configured={weatherData.configured}
          weather={weatherData.weather}
          reading={reading}
          onRetry={weatherData.retry}
        />
        {ready && (
          <TrustLine
            ageMs={ready.ageMs}
            dqss={ready.dqss}
            uncertainty={ready.uncertainty}
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
          <AirQualityLine reading={reading} />
          <WindMinimap
            status={weatherData.status}
            configured={weatherData.configured}
            wind={weatherData.wind}
            mslp={weatherData.mslp}
            // Only read once wind data is ready, which needs a resolved location;
            // the Seoul numbers are never drawn while `location` is null.
            lat={location?.lat ?? SEOUL_DEFAULT.lat}
            lon={location?.lon ?? SEOUL_DEFAULT.lon}
            onRetry={weatherData.retry}
          />
          <SourceFooter fetchedAt={weatherData.fetchedAt} locationSource={location?.source ?? null} />
        </div>
      )}
    </main>
  )
}
