import { buildSparkline } from '../../lib/sparkline'
import type { CapsuleDataReady } from '../fluid/capsule/useCapsuleData'

const SPARK_W = 220
const SPARK_H = 52
const SPARK_HOURS = 24

export interface HomeHeroRailProps {
  data: CapsuleDataReady
  reducedMotion: boolean
}

const TREND_LABEL: Record<CapsuleDataReady['alert'], string> = {
  worsening: 'Worsening ↑',
  steady: 'Steady →',
  unknown: '—',
}

/**
 * HomeHeroRail — fills the "Instrument Band" hero's right-hand space
 * (design-audit V2, same finding as Today's `WeatherHeroRail`) with a
 * compact 24h PM2.5 spark plus two stat tiles. Reuses `data.series24h` /
 * `data.range` / `data.alert` — the same `useCapsuleData` result
 * `HomeForecastStrip` and `HomeWhyNow` already render below the fold, no
 * second fetch.
 */
export default function HomeHeroRail({ data, reducedMotion }: HomeHeroRailProps) {
  const spark = buildSparkline(
    data.series24h.slice(0, SPARK_HOURS).map((p) => p.p50),
    SPARK_W,
    SPARK_H,
  )

  return (
    <div className="home-hero__rail">
      <span className="home-hero__rail-head t-micro">24H PM2.5</span>
      {spark ? (
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          className="home-hero__rail-svg"
          role="img"
          aria-label="24-hour PM2.5 trend"
        >
          <polygon points={spark.areaPoints} className="home-hero__rail-area" />
          <polyline points={spark.linePoints} className="home-hero__rail-line" fill="none" />
          <circle cx={spark.endX} cy={spark.endY} r={3.5} className="home-hero__rail-dot" />
        </svg>
      ) : (
        <p className="home-hero__rail-empty t-caption">No 24h series available this pass.</p>
      )}

      <div
        className={reducedMotion ? 'home-hero__rail-divider' : 'home-hero__rail-divider motion-draw'}
        aria-hidden="true"
      />

      <div className="home-hero__rail-stats">
        <div className="home-hero__rail-tile">
          <span className="home-hero__rail-tile-label t-micro">24h range</span>
          <span className="home-hero__rail-tile-value">
            {data.range ? `${Math.round(data.range.lo)}–${Math.round(data.range.hi)}` : '—'}
          </span>
          <span className="home-hero__rail-tile-sub t-caption">
            {data.range ? 'µg/m³' : 'No band published'}
          </span>
        </div>
        <div className="home-hero__rail-tile">
          <span className="home-hero__rail-tile-label t-micro">Trend</span>
          <span className="home-hero__rail-tile-value">{TREND_LABEL[data.alert]}</span>
          <span className="home-hero__rail-tile-sub t-caption">next 24h</span>
        </div>
      </div>
    </div>
  )
}
