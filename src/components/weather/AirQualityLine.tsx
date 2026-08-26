import AqiDot from '../wireframe/AqiDot'
import WfSkeleton from '../wireframe/WfSkeleton'
import WfDataState from '../wireframe/WfDataState'
import { sectionDataState } from './sectionState'
import { tierFromPm25 } from '../fluid/capsule/useCapsuleData'
import type { AqiTier } from '../wireframe/AqiDot'
import type { WeatherPageStatus } from '../../hooks/useWeatherPageData'
import type { OpenMeteoAqHourly } from '../../types/forecast'

export interface AirQualityLineProps {
  status: WeatherPageStatus
  configured: boolean
  aq: OpenMeteoAqHourly | null
  onRetry: () => void
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
 * AirQualityLine — S4. One-line PM2.5 readout using the same K4 6-tier cut
 * (`tierFromPm25`, shared with AqiCapsule) against this location's own
 * `pm2_5` reading — not DQSS/p10-p90-bearing (this is the consumer-facing
 * line, per the approved storyboard; that uncertainty band belongs to the
 * Globe/Today surfaces, not this quick line).
 */
export default function AirQualityLine({ status, configured, aq, onRetry }: AirQualityLineProps) {
  const raw = aq?.pm2_5?.[0]
  const pm25 = raw != null && Number.isFinite(raw) ? raw : null
  const state = sectionDataState(status, configured, pm25 !== null)
  const tier: AqiTier = pm25 !== null ? tierFromPm25(pm25) : 'unknown'

  return (
    <section className="wx-section" aria-label="Air quality">
      <div className="wx-section__head">
        <span className="t-tag">Air quality</span>
      </div>
      {state.kind === 'loading' && <WfSkeleton height={64} />}
      {state.kind !== 'loading' && state.kind !== 'ready' && (
        <WfDataState state={state} onRetry={state.kind === 'error' ? onRetry : undefined} variant="inline" />
      )}
      {state.kind === 'ready' && pm25 !== null && (
        <div className="wx-aq-line" data-aqi={tier}>
          <AqiDot tier={tier} size={12} />
          <span className="wx-aq-line__value">{Math.round(pm25)} µg/m³ PM2.5</span>
          <span className="wx-aq-line__grade">{TIER_LABEL[tier]}</span>
          <span className="wx-aq-line__action">{TIER_ACTION[tier]}</span>
          <a className="wx-aq-line__more" href="/globe">
            See details on the Globe →
          </a>
        </div>
      )}
    </section>
  )
}
