import WfGlassCard from '../wireframe/WfGlassCard'
import WfTag from '../wireframe/WfTag'
import WfSkeleton from '../wireframe/WfSkeleton'
import WfDataState from '../wireframe/WfDataState'
import AqiDot from '../wireframe/AqiDot'
import { dataState } from '../../types/dataState'
import { ACTION_SENTENCE, STALE_THRESHOLD_MS, TIER_LABEL, TIER_TINT_BAND } from '../../lib/config/homeBriefing'
import { formatElapsed, formatUtcTime } from '../../lib/home/whyNow'
import type { CapsuleDataState } from '../fluid/capsule/useCapsuleData'

export interface HomeHeroProps {
  data: CapsuleDataState
  /** The render's "now", read once by the caller (`Home.tsx`, via a lazy
   * `useState` initializer) rather than here — calling `Date.now()` inside a
   * component body is an impure render, which this keeps out of. */
  nowMs: number
}

/**
 * HomeHero — the "Instrument Band" (approved mockup variant A): a full-width
 * AQI-tinted band showing the featured city's current reading, its 24h-
 * forecast valid time, freshness, and one plain-language action sentence.
 *
 * The featured city is always the "thickest air" pick `useCapsuleData`
 * already makes (highest current PM2.5 among the forecast's cities) — not a
 * personalized location, unlike /weather. The eyebrow says so explicitly
 * rather than implying this is "your" air.
 */
export default function HomeHero({ data, nowMs }: HomeHeroProps) {
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
  const value = Math.round(data.current)

  const ariaSummary = `Current PM2.5 in ${data.city} is ${value} micrograms per cubic meter, ${tierLabel}${
    isStale ? '. This reading is stale' : ''
  }.`

  return (
    <WfGlassCard
      as="section"
      aqi={tintBand}
      className={isStale ? 'home-hero home-hero--stale' : 'home-hero'}
      aria-label={ariaSummary}
    >
      <div className="home-hero__inner">
        <div className="home-hero__eyebrow">
          NOW · {data.city}, {data.countryCode} · FALLBACK: THICKEST AIR
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
      </div>
    </WfGlassCard>
  )
}
