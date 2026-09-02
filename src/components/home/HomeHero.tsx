import { useEffect, useRef, useState } from 'react'
import WfGlassCard from '../wireframe/WfGlassCard'
import WfTag from '../wireframe/WfTag'
import WfSkeleton from '../wireframe/WfSkeleton'
import WfDataState from '../wireframe/WfDataState'
import AqiDot from '../wireframe/AqiDot'
import TrustLine from '../wireframe/TrustLine'
import Materialize from '../fluid/Materialize'
import CitySearch from '../weather/CitySearch'
import { dataState } from '../../types/dataState'
import { ACTION_SENTENCE, STALE_THRESHOLD_MS, TIER_LABEL, TIER_TINT_BAND } from '../../lib/config/homeBriefing'
import { formatElapsed, formatUtcTime } from '../../lib/home/whyNow'
import type { CapsuleDataState } from '../fluid/capsule/useCapsuleData'
import type { WeatherCity } from '../../lib/cityCatalog'
import { useSpring } from '../../motion/useSpring'
import type { SpringConfig } from '../../motion/spring'

export interface HomeHeroProps {
  data: CapsuleDataState
  /** The render's "now", read once by the caller (`Home.tsx`, via a lazy
   * `useState` initializer) rather than here — calling `Date.now()` inside a
   * component body is an impure render, which this keeps out of. */
  nowMs: number
  requestingLocation: boolean
  locationDenied: boolean
  onRequestLocation: () => void
  onSelectCity: (city: WeatherCity) => void
}

/** Slower/gentler than the base Δ5 contract (ζ1.0·r0.35) — a headline number
 * reads better settling over half a second than snapping in 350ms. */
const VALUE_SPRING: SpringConfig = { damping: 1.0, response: 0.5 }

/**
 * HomeHero — the "Instrument Band" (approved mockup variant A): a full-width
 * AQI-tinted band showing the featured city's current reading, its 24h-
 * forecast valid time, freshness, and one plain-language action sentence.
 *
 * UI Tier-1 P1-B (uiux-evaluation-manyfast-2026-09-02 §4 G1): until the
 * visitor personalizes, the featured city is the "thickest air" pick
 * `useCapsuleData` already makes (highest current PM2.5 among the forecast's
 * cities) — very unlikely to be the visitor's own air. The eyebrow, a
 * fallback band, and two CTAs ("see air quality near me" / "search a
 * location") say so explicitly and offer a way out, rather than implying
 * this is "your" air. Once personalized (`data.isPersonalized`), the band
 * and CTAs drop and the eyebrow reads as a plain observation location.
 */
export default function HomeHero({
  data,
  nowMs,
  requestingLocation,
  locationDenied,
  onRequestLocation,
  onSelectCity,
}: HomeHeroProps) {
  // Hooks run unconditionally (Rules of Hooks) ahead of the loading/missing
  // early returns below — `targetValue` is a 0 sentinel until `data` is
  // actually `'ready'`, mirroring the sentinel pattern `useSmoothedProgress`
  // uses for its own mount sync.
  const isReady = data.status === 'ready'
  const targetValue = isReady ? data.current : 0
  const valueSpring = useSpring(targetValue, VALUE_SPRING)
  const [displayedValue, setDisplayedValue] = useState(targetValue)
  const hasSyncedRef = useRef(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // The `.set()`/`.jump()` calls are side effects, not state updates — same
  // separation ChatFAB's `translateY` effect uses. The first time `data`
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

  if (data.status === 'loading') {
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

  if (data.status === 'missing') {
    return (
      <section className="home-hero home-hero--missing" aria-label="Air quality unavailable">
        <div className="home-hero__inner">
          <WfDataState
            state={dataState('unavailable', { source: 'Open-Meteo CAMS forecast (via HF live-data)' })}
          />
        </div>
      </section>
    )
  }

  const elapsedMs = nowMs - new Date(data.updatedAt).getTime()
  const isStale = elapsedMs > STALE_THRESHOLD_MS
  const tierLabel = TIER_LABEL[data.tier]
  const tintBand = data.tier === 'unknown' ? undefined : TIER_TINT_BAND[data.tier]
  const actionSentence = ACTION_SENTENCE[data.tier]
  const value = Math.round(displayedValue)

  const uncertainty =
    data.p10 !== null && data.p90 !== null
      ? { available: true as const, p10: data.p10, p90: data.p90, unit: 'µg/m³' }
      : { available: false as const, reason: "this forecast doesn't publish a range" }

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
        <div className="home-hero__eyebrow">
          {data.isPersonalized ? (
            <>MY LOCATION · {data.city}, {data.countryCode}</>
          ) : (
            <>NOW · {data.city}, {data.countryCode} · FALLBACK: THICKEST AIR</>
          )}
        </div>

        <div className="home-hero__reading">
          <div
            className={
              isStale ? 'home-hero__value home-hero__value--muted t-numeric num' : 'home-hero__value t-numeric num'
            }
          >
            {value}
            <span className="home-hero__unit">µg/m³</span>
          </div>
          <div className="home-hero__tier">
            <AqiDot tier={data.tier} size={14} />
            <span className="home-hero__tier-label">{tierLabel}</span>
            <WfTag className="home-hero__badge">Forecast</WfTag>
          </div>
        </div>

        {!data.isPersonalized && (
          <div className="home-hero__fallback-band">
            <b>Showing Earth's thickest air right now</b> — not your local reading.
          </div>
        )}

        <div className="home-hero__location-ctas">
          {!data.isPersonalized ? (
            <>
              <button
                type="button"
                className="home-hero__cta home-hero__cta--primary"
                onClick={onRequestLocation}
                disabled={requestingLocation}
              >
                {requestingLocation ? 'Locating…' : 'See air quality near me'}
              </button>
              <button
                type="button"
                className="home-hero__cta home-hero__cta--secondary"
                onClick={() => setSearchOpen((v) => !v)}
                aria-expanded={searchOpen}
              >
                Search a location
              </button>
            </>
          ) : (
            <button
              type="button"
              className="home-hero__cta home-hero__cta--secondary"
              onClick={() => setSearchOpen((v) => !v)}
              aria-expanded={searchOpen}
            >
              Not you? Search again
            </button>
          )}
        </div>

        {locationDenied && !data.isPersonalized && (
          <p className="home-hero__location-note">
            Location permission was not granted — showing the global fallback.
          </p>
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
          <span>Valid {formatUtcTime(data.series24h[0]?.time ?? data.updatedAt)}</span>
          <span aria-hidden="true">·</span>
          <span className={isStale ? 'home-hero__stale-flag' : undefined}>
            {isStale ? 'Stale · updated ' : 'Updated '}
            {formatElapsed(elapsedMs)}
          </span>
          <span aria-hidden="true">·</span>
          <span>Open-Meteo CAMS forecast</span>
        </div>

        {actionSentence ? <p className="home-hero__action">{actionSentence}</p> : null}

        <TrustLine
          ageMs={elapsedMs}
          dqss={{ available: false, reason: 'not measured by this forecast source' }}
          uncertainty={uncertainty}
        />
      </div>
    </WfGlassCard>
  )
}
