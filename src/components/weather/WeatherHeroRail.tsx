import { buildSparkline } from '../../lib/sparkline'
import AqiDot from '../wireframe/AqiDot'
import type { PrimaryReading } from '../../lib/reading/resolvePrimaryReading'

const SPARK_W = 220
const SPARK_H = 52
const SPARK_HOURS = 24

export interface WeatherHeroRailProps {
  /** Same `weather.temperature_2m` array the S2 hourly rail already renders
   * below — no second fetch, just a compact 24h view of it up here. */
  hourlyTemp: (number | null | undefined)[] | undefined
  /** The shared headline resolver's result (W1b commit ③) — the same reading
   * `/today`'s HUD, Home and the floating capsule show, so the "PM2.5 now"
   * tile can't be a third number next to them. */
  reading: PrimaryReading
  uvIndexNow: number | null
  reducedMotion: boolean
}

/** Under the tile's number: its unit plus which source backs it — a model
 * analysis is never worded as a measurement (DESIGN.md §8). A CAMS value is
 * a nearest-city forecast, and this tile sits under the viewer's own place
 * name, so it names that city and how far it is — otherwise another city's
 * number reads as the viewer's own. */
function pm25Sub(reading: PrimaryReading): string {
  if (reading.status === 'loading') return 'Loading…'
  if (reading.status === 'unavailable') return 'Unavailable'
  // The resolver's own staleness verdict (same as the HUD's) — this tile is
  // on the default tab, where the HUD is not.
  const stale = reading.stale ? ' · stale' : ''
  if (reading.source === 'analysis') return `µg/m³ · model analysis${stale}`
  const cc = reading.place.countryCode ? `, ${reading.place.countryCode}` : ''
  const km = reading.place.distanceKm != null ? ` · ${Math.round(reading.place.distanceKm)} km` : ''
  return `µg/m³ · CAMS forecast · ${reading.place.label}${cc}${km}${stale}`
}

/**
 * WeatherHeroRail — S1 companion. Fills the sky-glass hero's right-hand
 * space (design-audit V2: `.wx-hero__reading` used 529 of 1280px on desktop)
 * with a compact 24h temperature spark plus two instrument tiles, reusing
 * `.wx-tile` (weather.css S3's own class) so the grammar matches the
 * Conditions-tab grid exactly rather than inventing a second tile style.
 */
export default function WeatherHeroRail({ hourlyTemp, reading, uvIndexNow, reducedMotion }: WeatherHeroRailProps) {
  const spark = buildSparkline((hourlyTemp ?? []).slice(0, SPARK_HOURS), SPARK_W, SPARK_H)
  const ready = reading.status === 'ready' ? reading : null

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
            {ready && <AqiDot tier={ready.tier} size={10} />}
            <span className="wx-tile__value">{ready ? Math.round(ready.pm25) : '—'}</span>
          </div>
          <span className="wx-tile__sub">{pm25Sub(reading)}</span>
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
