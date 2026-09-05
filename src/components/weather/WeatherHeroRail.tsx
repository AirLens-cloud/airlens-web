import { buildSparkline } from '../../lib/sparkline'
import AqiDot from '../wireframe/AqiDot'
import { tierFromPm25 } from '../fluid/capsule/useCapsuleData'

const SPARK_W = 220
const SPARK_H = 52
const SPARK_HOURS = 24

export interface WeatherHeroRailProps {
  /** Same `weather.temperature_2m` array the S2 hourly rail already renders
   * below — no second fetch, just a compact 24h view of it up here. */
  hourlyTemp: (number | null | undefined)[] | undefined
  /** `weatherData.aq.pm2_5[0]` (Today.tsx already fetches this for the
   * Conditions tab's `AirQualityLine`) — reused, not refetched. */
  pm25Now: number | null
  uvIndexNow: number | null
  reducedMotion: boolean
}

/**
 * WeatherHeroRail — S1 companion. Fills the sky-glass hero's right-hand
 * space (design-audit V2: `.wx-hero__reading` used 529 of 1280px on desktop)
 * with a compact 24h temperature spark plus two instrument tiles, reusing
 * `.wx-tile` (weather.css S3's own class) so the grammar matches the
 * Conditions-tab grid exactly rather than inventing a second tile style.
 */
export default function WeatherHeroRail({ hourlyTemp, pm25Now, uvIndexNow, reducedMotion }: WeatherHeroRailProps) {
  const spark = buildSparkline((hourlyTemp ?? []).slice(0, SPARK_HOURS), SPARK_W, SPARK_H)
  const tier = pm25Now !== null ? tierFromPm25(pm25Now) : null

  return (
    <div className="wx-hero__rail">
      <span className="wx-hero__rail-head t-micro">24H temperature</span>
      {spark ? (
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          className="wx-hero__rail-svg"
          role="img"
          aria-label="24-hour temperature trend"
        >
          <polygon points={spark.areaPoints} className="wx-hero__rail-area" />
          <polyline points={spark.linePoints} className="wx-hero__rail-line" fill="none" />
          <circle cx={spark.endX} cy={spark.endY} r={3.5} className="wx-hero__rail-dot" />
        </svg>
      ) : (
        <p className="wx-hero__rail-empty t-caption">No hourly trend available.</p>
      )}

      <div
        className={reducedMotion ? 'wx-hero__rail-divider' : 'wx-hero__rail-divider motion-draw'}
        aria-hidden="true"
      />

      <div className="wx-hero__rail-stats">
        <div className="wx-tile wx-hero__rail-tile">
          <span className="wx-tile__label">PM2.5 now</span>
          <div className="wx-tile__value-row">
            {tier && <AqiDot tier={tier} size={10} />}
            <span className="wx-tile__value">{pm25Now !== null ? Math.round(pm25Now) : '—'}</span>
          </div>
          <span className="wx-tile__sub">{pm25Now !== null ? 'µg/m³' : 'Not measured'}</span>
        </div>
        <div className="wx-tile wx-hero__rail-tile">
          <span className="wx-tile__label">UV index</span>
          <div className="wx-tile__value-row">
            <span className="wx-tile__value">{uvIndexNow !== null ? Math.round(uvIndexNow) : '—'}</span>
          </div>
          <span className="wx-tile__sub">current hour</span>
        </div>
      </div>
    </div>
  )
}
