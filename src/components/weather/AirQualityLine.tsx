import AqiDot from '../wireframe/AqiDot'
import WfSkeleton from '../wireframe/WfSkeleton'
import WfDataState from '../wireframe/WfDataState'
import { dataState } from '../../types/dataState'
import { PRIMARY_READING_SOURCES, readingSourceLine, staleReadingNote } from '../../lib/reading/readingCopy'
import type { AqiTier } from '../wireframe/AqiDot'
import type { PrimaryReading } from '../../lib/reading/resolvePrimaryReading'

export interface AirQualityLineProps {
  /** The shared headline resolver's result (W1b commit ③) — the same reading
   * `/today`'s HUD, the hero's "PM2.5 now" tile, Home and the capsule show. */
  reading: PrimaryReading
}

const TIER_LABEL: Record<AqiTier, string> = {
  good: 'Good',
  moderate: 'Moderate',
  usg: 'Unhealthy for sensitive groups',
  unhealthy: 'Unhealthy',
  'very-unhealthy': 'Very unhealthy',
  hazardous: 'Hazardous',
  unknown: 'Unknown',
}

const TIER_ACTION: Record<AqiTier, string> = {
  good: 'A great day to be outside.',
  moderate: 'Sensitive groups should watch for symptoms.',
  usg: 'Sensitive groups should limit prolonged outdoor exertion.',
  unhealthy: 'Consider a mask outdoors and limit exertion.',
  'very-unhealthy': 'Avoid outdoor exertion — wear a mask if you go out.',
  hazardous: 'Stay indoors — avoid outdoor exposure.',
  unknown: '',
}

/**
 * AirQualityLine — S4. One-line PM2.5 readout of the shared primary reading
 * (W1b commit ③ — it used to read its own Open-Meteo hourly point, a third
 * number next to the HUD's and the capsule's). Not DQSS/p10-p90-bearing
 * itself (this is the consumer-facing line, per the approved storyboard) —
 * `/today`'s TrustLine under the hero carries that band — but it does say
 * which source backs the number, in the same words as Home and the capsule.
 */
export default function AirQualityLine({ reading }: AirQualityLineProps) {
  return (
    <section className="wx-section" aria-label="Air quality">
      <div className="wx-section__head">
        <span className="t-tag">Air quality</span>
      </div>
      {reading.status === 'loading' && <WfSkeleton height={64} />}
      {reading.status === 'unavailable' && (
        <>
          <WfDataState state={dataState('unavailable', { source: PRIMARY_READING_SOURCES })} variant="inline" />
          {/* The inline data-state prints no source row, so name what was tried here. */}
          <p className="wx-aq-line__source t-caption">Source: {PRIMARY_READING_SOURCES}</p>
        </>
      )}
      {reading.status === 'ready' && (
        <div className="wx-aq-line" data-aqi={reading.tier} data-stale={reading.stale || undefined}>
          <AqiDot tier={reading.tier} size={12} />
          <span className="wx-aq-line__value">{Math.round(reading.pm25)} µg/m³ PM2.5</span>
          <span className="wx-aq-line__grade">{TIER_LABEL[reading.tier]}</span>
          {/* Stale (the resolver's own 48h verdict, same as the HUD's): the
              advice is withheld — it would read as guidance for the air now. */}
          <span className="wx-aq-line__action">
            {reading.stale ? staleReadingNote(reading) : TIER_ACTION[reading.tier]}
          </span>
          <a className="wx-aq-line__more" href="/globe">
            See details on the Globe →
          </a>
          <span className="wx-aq-line__source t-caption">{readingSourceLine(reading)}</span>
        </div>
      )}
    </section>
  )
}
