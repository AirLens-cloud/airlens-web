import { useEffect, useRef, useState } from 'react'
import WfGlassCard from '../wireframe/WfGlassCard'
import WfSkeleton from '../wireframe/WfSkeleton'
import WfDataState from '../wireframe/WfDataState'
import AqiDot from '../wireframe/AqiDot'
import TrustLine from '../wireframe/TrustLine'
import StateChip from '../content/StateChip'
import Materialize from '../fluid/Materialize'
import CitySearch from '../weather/CitySearch'
import HomeHeroRail from './HomeHeroRail'
import { dataState } from '../../types/dataState'
import { ACTION_SENTENCE, TIER_LABEL, TIER_TINT_BAND } from '../../lib/config/homeBriefing'
import { formatElapsed, formatUtcTime } from '../../lib/home/whyNow'
import { useReducedMotion } from '../../landing/shared/perf/useReducedMotion'
import type { CapsuleDataState } from '../fluid/capsule/useCapsuleData'
import type { WeatherCity } from '../../lib/cityCatalog'
import { DENIED_NOTICE, LOCATING_LABEL, type LocationSource } from '../../lib/location/resolveLocation'
import type { PrimaryReading } from '../../lib/reading/resolvePrimaryReading'
import { PRIMARY_READING_SOURCES, readingSourceLine, secondaryForecastLine } from '../../lib/reading/readingCopy'
import { useSpring } from '../../motion/useSpring'
import type { SpringConfig } from '../../motion/spring'

export interface HomeHeroProps {
  /** The shared headline resolver's result (W1b commit ②) — same source
   * `/today` and the floating capsule read, so all three surfaces show the
   * same number for the same place and moment. Every headline-facing value
   * below (number, tier, tint, action sentence, TrustLine, validity/age)
   * reads from this, never from `data`. */
  reading: PrimaryReading
  /** CAMS-only 24h outlook — `HomeHeroRail`'s spark/range/trend keep reading
   * this, unconditionally, regardless of which source backs `reading` above
   * (Glass-box: a CAMS forecast band must never be attached to a grid
   * analysis number). */
  data: CapsuleDataState
  requestingLocation: boolean
  locationDenied: boolean
  /** The visitor's own resolved place name (`location.label`) — read once by
   * the caller, same as `locationSource` below. Never the CAMS feed city. */
  placeLabel: string
  /** Where `placeLabel`/`locationSource` came from (W1a — `useResolvedLocation`'s
   * priority chain: opt-in choice > IP-approximate > Seoul default). `null`
   * while still resolving — the eyebrow shows `LOCATING_LABEL` with no source
   * suffix then, rather than guessing at a default. */
  locationSource: LocationSource | null
  onRequestLocation: () => void
  onSelectCity: (city: WeatherCity) => void
}

/** Slower/gentler than the base Δ5 contract (ζ1.0·r0.35) — a headline number
 * reads better settling over half a second than snapping in 350ms. */
const VALUE_SPRING: SpringConfig = { damping: 1.0, response: 0.5 }

/**
 * HomeHero — the "Instrument Band" (approved mockup variant A): a full-width
 * AQI-tinted band showing the resolved location's current reading, its
 * source, freshness, and one plain-language action sentence.
 *
 * W1a (`useResolvedLocation`'s priority chain): until the visitor opts in,
 * the shown location is either the edge's IP-approximate lookup
 * (`locationSource === 'approx'`) or, failing that, a fixed Seoul default
 * (`'default'`) — never the old "thickest air" worldwide pick, which has
 * been retired. The eyebrow, a fallback band (default only), and two CTAs
 * ("see air quality near me" / "search a location") say so explicitly and
 * offer a way out, rather than implying this is "your" air. Once
 * personalized via geolocation (`locationSource === 'geolocation'`), the
 * band and primary CTA drop and the eyebrow reads as a plain observation
 * location; a `'search'` choice (a city picked by hand) is already the
 * visitor's own intent, so it also reads as a plain location, but the CTAs
 * stay up since geolocation itself hasn't been granted.
 */
export default function HomeHero({
  reading,
  data,
  requestingLocation,
  locationDenied,
  placeLabel,
  locationSource,
  onRequestLocation,
  onSelectCity,
}: HomeHeroProps) {
  // Hooks run unconditionally (Rules of Hooks) ahead of the loading/missing
  // early returns below — `targetValue` is a 0 sentinel until `reading` is
  // actually `'ready'`, mirroring the sentinel pattern `useSmoothedProgress`
  // uses for its own mount sync.
  const isReady = reading.status === 'ready'
  const targetValue = isReady ? reading.pm25 : 0
  const valueSpring = useSpring(targetValue, VALUE_SPRING)
  const [displayedValue, setDisplayedValue] = useState(targetValue)
  const hasSyncedRef = useRef(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const reducedMotion = useReducedMotion()

  // The `.set()`/`.jump()` calls are side effects, not state updates — same
  // separation ChatFAB's `translateY` effect uses. The first time `reading`
  // resolves to `'ready'`, this jumps straight to the value (no animated
  // count-up from the 0 sentinel on initial load); every value after that
  // springs from the previously displayed number to the new one.
  useEffect(() => {
    if (!isReady) return
    if (!hasSyncedRef.current) {
      hasSyncedRef.current = true
      valueSpring.jump(targetValue)
      setDisplayedValue(targetValue)
      return
    }
    valueSpring.set(targetValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, targetValue])

  // Unlike CapsulePanel/ChatFAB's imperative style-ref writes, this spring
  // drives rendered text content, so its subscriber re-renders via state.
  useEffect(() => {
    return valueSpring.subscribe(setDisplayedValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (reading.status === 'loading') {
    return (
      <section className="home-hero home-hero--loading" aria-busy="true" aria-label="Loading current air quality">
        <div className="home-hero__inner">
          <WfSkeleton width={180} height={14} />
          <WfSkeleton width={280} height={110} className="home-hero__value-skeleton" />
          <WfSkeleton width={220} height={16} />
          <WfSkeleton width={320} height={14} />
        </div>
      </section>
    )
  }

  if (reading.status === 'unavailable') {
    return (
      <section className="home-hero home-hero--missing" aria-label="Air quality unavailable">
        <div className="home-hero__inner">
          <WfDataState
            state={dataState('unavailable', { source: PRIMARY_READING_SOURCES })}
          />
        </div>
      </section>
    )
  }

  // The resolver's own per-source staleness verdict — the same one `/today`'s
  // HUD reads (`hudStatus`), so the two surfaces never disagree about it.
  // Not `ageMs > refreshMs`: `refreshMs` is a republish-cadence label only
  // (`lib/config/readingCadence.ts`), and the upstream cron routinely runs
  // late, so a cadence comparison would flag nearly every reading as stale.
  const isStale = reading.stale
  const tierLabel = TIER_LABEL[reading.tier]
  const tintBand = reading.tier === 'unknown' ? undefined : TIER_TINT_BAND[reading.tier]
  const actionSentence = ACTION_SENTENCE[reading.tier]
  const value = Math.round(displayedValue)

  return (
    <WfGlassCard
      as="section"
      aqi={tintBand}
      className={isStale ? 'home-hero home-hero--stale' : 'home-hero'}
      // Generic region name only — the value/tier/staleness are already in the
      // rendered text, so a data-bearing label would be read twice by SRs.
      aria-label="Current air quality"
    >
      <div className="home-hero__inner">
        <div className="home-hero__main">
        <div className="home-hero__eyebrow">
          {locationSource === null ? (
            LOCATING_LABEL
          ) : locationSource === 'approx' ? (
            <>~ {placeLabel} · APPROXIMATE (IP-BASED)</>
          ) : locationSource === 'default' ? (
            <>{placeLabel} · DEFAULT LOCATION — NOT YOURS</>
          ) : (
            placeLabel
          )}
        </div>

        <div className="home-hero__reading">
          <div className={reducedMotion ? 'home-hero__value-mask' : 'home-hero__value-mask motion-reveal-mask'}>
            <div className="home-hero__value t-numeric num">
              {value}
              <span className="home-hero__unit">µg/m³</span>
            </div>
          </div>
          <div className="home-hero__tier">
            <AqiDot tier={reading.tier} size={14} />
            <span className="home-hero__tier-label">{tierLabel}</span>
            {/* One chip either way: stale merges both states into a single
                label ("Model analysis · Stale 3h") instead of stacking a
                second chip — the hero section sits at the mono-caps label
                budget (DESIGN.md §2, ≤8 per section) and a ninth would break
                it. */}
            {isStale ? (
              <StateChip
                variant="stale"
                label={reading.source === 'analysis' ? 'Model analysis · Stale' : 'Forecast · Stale'}
                detail={formatElapsed(reading.ageMs)?.replace(/ ago$/, '')}
                index={0}
              />
            ) : (
              <StateChip variant={reading.source === 'analysis' ? 'analysis' : 'forecast'} index={0} />
            )}
          </div>
        </div>

        {/* Where the number comes from — replaces the old hard-coded "Open-
            Meteo CAMS forecast" label (design-audit review: a hero that can
            now show either source must say which one plainly). The
            secondary line only appears when the primary is the grid
            analysis AND CAMS also resolved — Glass-box: it discloses the
            city forecast's own value, never folded into the analysis
            number's own (nonexistent) uncertainty band. */}
        <p className="home-hero__source t-caption">{readingSourceLine(reading)}</p>
        {reading.source === 'analysis' && reading.secondary && (
          <p className="home-hero__source t-caption">{secondaryForecastLine(reading.secondary)}</p>
        )}

        {locationSource === 'default' && (
          <div className="home-hero__fallback-band t-caption">
            <b>Showing Seoul by default</b> — not your location.
          </div>
        )}

        <div className="home-hero__location-ctas">
          {locationSource !== 'geolocation' ? (
            <>
              <button
                type="button"
                className="home-hero__cta home-hero__cta--primary t-caption"
                onClick={onRequestLocation}
                disabled={requestingLocation}
              >
                {requestingLocation ? 'Locating…' : 'See air quality near me'}
              </button>
              <button
                type="button"
                className="home-hero__cta home-hero__cta--secondary t-caption"
                onClick={() => setSearchOpen((v) => !v)}
                aria-expanded={searchOpen}
              >
                Search a location
              </button>
            </>
          ) : (
            <button
              type="button"
              className="home-hero__cta home-hero__cta--secondary t-caption"
              onClick={() => setSearchOpen((v) => !v)}
              aria-expanded={searchOpen}
            >
              Not you? Search again
            </button>
          )}
        </div>

        {locationDenied && locationSource !== null && (
          <p className="home-hero__location-note t-caption">{DENIED_NOTICE[locationSource]}</p>
        )}

        <Materialize show={searchOpen} origin="top left">
          <CitySearch
            onSelect={(city) => {
              onSelectCity(city)
              setSearchOpen(false)
            }}
          />
        </Materialize>

        <div className="home-hero__meta">
          <span>
            {reading.source === 'analysis' ? 'As of' : 'Valid'}{' '}
            {formatUtcTime(reading.validTimeIso ?? reading.updatedAtIso)}
          </span>
          <span aria-hidden="true">·</span>
          <span className={isStale ? 'home-hero__stale-flag' : undefined}>
            {isStale ? 'Stale · updated ' : 'Updated '}
            {formatElapsed(reading.ageMs)}
          </span>
        </div>

        {actionSentence ? <p className="home-hero__action">{actionSentence}</p> : null}

        <TrustLine ageMs={reading.ageMs} dqss={reading.dqss} uncertainty={reading.uncertainty} />
      </div>

      <HomeHeroRail data={data} reducedMotion={reducedMotion} />
      </div>
    </WfGlassCard>
  )
}
