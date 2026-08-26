// Ported from AirLens-platform apps/landing-lab
// `src/concepts/atmos/sections/Sparkline.tsx` (Wave L1, 2026-08-26); data/theme
// imports rebound to `shared/data` and the chapter-local theme module.
import { useState, type PointerEvent } from 'react'
import type { TftCity } from '../../shared/data/loaders'
import { ATMOS } from '../theme'

// Glass-box forecast sparkline: p10–p90 uncertainty band + p50 line.
// Hover (or tap-drag on touch) scans the series to read the value at any hour.
//
// No DQSS letter here. An earlier version graded the forecast A-F from its own band
// width — but the TFT dataset carries no DQSS score, so that letter asserted a
// data-quality grade no model ever produced. The band width is a real property of the
// forecast, so it is stated as what it is: how wide the interval runs, not a grade.
export default function Sparkline({ city }: { city: TftCity }) {
  const h = city.hourly
  const w = 240
  const ht = 66
  const pad = 5
  const ys = h.flatMap((d) => [d.pm25_p10, d.pm25_p90, d.pm25])
  const ymin = Math.min(...ys)
  const ymax = Math.max(...ys)
  const xAt = (i: number) => pad + (i / (h.length - 1)) * (w - 2 * pad)
  const yAt = (v: number) => ht - pad - ((v - ymin) / Math.max(1e-6, ymax - ymin)) * (ht - 2 * pad)

  const top = h.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.pm25_p90).toFixed(1)}`)
  const bot = h.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.pm25_p10).toFixed(1)}`).reverse()
  const band = `M${top.join(' L')} L${bot.join(' L')} Z`
  const line = `M${h.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.pm25).toFixed(1)}`).join(' L')}`

  // Mean width of the p10–p90 interval as a share of p50 — a measured property of this
  // forecast, reported as itself rather than compressed into a letter.
  const rel = h.reduce((s, d) => s + (d.pm25_p90 - d.pm25_p10) / Math.max(1, d.pm25), 0) / h.length

  const [hi, setHi] = useState<number | null>(null)
  const scan = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0
    setHi(Math.max(0, Math.min(h.length - 1, Math.round(frac * (h.length - 1)))))
  }
  const sel = hi ?? h.length - 1
  const d = h[sel]

  return (
    <div className="ch1-spark">
      <div className="ch1-spark__head">
        <span className="ch1-spark__city">{city.name}</span>
        <span className="ch1-spark__spread">BAND ±{(rel * 50).toFixed(0)}% OF p50</span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${ht}`}
        className="ch1-spark__svg"
        preserveAspectRatio="none"
        onPointerMove={scan}
        onPointerDown={scan}
        onPointerLeave={() => setHi(null)}
      >
        <path d={band} style={{ fill: ATMOS.accent, opacity: 0.22 }} />
        <path d={line} style={{ fill: 'none', stroke: ATMOS.ink, strokeWidth: 1.25 }} />
        {hi !== null && (
          <g>
            <line x1={xAt(sel)} y1={pad} x2={xAt(sel)} y2={ht - pad} stroke={ATMOS.accent} strokeWidth={0.75} opacity={0.6} />
            <circle cx={xAt(sel)} cy={yAt(d.pm25)} r={2.4} fill={ATMOS.ink} />
          </g>
        )}
      </svg>
      <div className="ch1-spark__foot">
        <span>
          {d.pm25.toFixed(0)} µg/m³ {hi !== null ? `+${sel}h` : 'p50'}
        </span>
        <span>p10–p90 {d.pm25_p10.toFixed(0)}–{d.pm25_p90.toFixed(0)}</span>
      </div>
    </div>
  )
}
