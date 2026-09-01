import { computePeak, computeSixHourDelta, formatUtcTime } from '../../lib/home/whyNow'
import type { CapsuleSeriesPoint } from '../fluid/capsule/useCapsuleData'

export interface HomeWhyNowProps {
  series: CapsuleSeriesPoint[]
}

/**
 * HomeWhyNow — left column of the below-the-fold row. Every line is a rule
 * derived directly from the 24h series (observed delta, observed peak); the
 * "UNKNOWN" block is the honest complement — driver attribution (weather,
 * traffic, fires) is not computed anywhere in this app, so it says so
 * instead of inferring one.
 */
export default function HomeWhyNow({ series }: HomeWhyNowProps) {
  const delta = computeSixHourDelta(series)
  const peak = computePeak(series)

  const direction = delta ? (delta.delta > 0.5 ? 'rose' : delta.delta < -0.5 ? 'fell' : 'held steady around') : null
  const sign = delta && delta.delta > 0 ? '+' : ''

  return (
    <div className="home-why-now">
      <h2 className="t-tag">Why now</h2>
      <ul className="home-why-now__list">
        {delta && direction ? (
          <li className="home-why-now__item">
            PM2.5 {direction} {direction !== 'held steady around' ? `${sign}${delta.delta.toFixed(1)} µg/m³ ` : ''}
            in 6h ({delta.fromValue.toFixed(1)} → {delta.toValue.toFixed(1)} µg/m³, {formatUtcTime(delta.fromTime)} →{' '}
            {formatUtcTime(delta.toTime)})
          </li>
        ) : null}
        {peak ? (
          <li className="home-why-now__item">
            Peak in the next 24h: {peak.value.toFixed(1)} µg/m³ around {formatUtcTime(peak.time)}
          </li>
        ) : null}
        {!delta && !peak ? (
          <li className="home-why-now__item">No 24h series available this pass — nothing to report.</li>
        ) : null}
        <li className="home-why-now__item home-why-now__item--unknown">
          <span className="home-why-now__unknown-tag t-micro">Unknown</span>
          Driver attribution (weather, traffic, fires) is not available — nothing here is inferred.
        </li>
      </ul>
    </div>
  )
}
