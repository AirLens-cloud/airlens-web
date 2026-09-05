/**
 * SdidChart — band 4. Observed PM2.5 against the synthetic counterfactual, with
 * the post-treatment gap shaded.
 *
 * Geometry comes from `lib/insights/insightsAttScale`, ported verbatim from the
 * monorepo; this component is a thinner shell than the source's
 * `InsightsAttChart` because the crosshair sync (d3-scale + the WfChart context
 * primitives) has nothing to sync with in this repo — the map owns its own year
 * scrubber and does not drive the chart.
 *
 * The honesty the chart exists to protect: only the POST-treatment gap is
 * shaded. The pre-treatment gap is how badly the synthetic control fit the
 * country before the policy, and shading it would present fit error as effect.
 */
import { useMemo } from 'react'
import {
  PAD_B,
  PAD_L,
  PAD_R,
  PAD_T,
  VB_H,
  VB_W,
  buildSdidScale,
  cleanSeries,
  effectAreaPath,
  lineFor,
  preTreatmentBand,
  yearTicks,
} from '../../lib/insights/insightsAttScale'
import type { SdidPoint } from '../../types/policy'

export interface SdidChartProps {
  series: SdidPoint[] | undefined
  /** The analysed treatment year; null when the country was never estimated. */
  treatmentYear: number | null
  unit?: string
}

/** Approximate width of the TREATMENT label, so it flips left near the edge. */
const LABEL_W = 92

export default function SdidChart({ series, treatmentYear, unit = 'µg/m³' }: SdidChartProps) {
  const data = useMemo(() => {
    const pts = cleanSeries(series ?? [])
    if (pts.length < 2) return null
    const scale = buildSdidScale(pts)
    const boundary =
      treatmentYear !== null && treatmentYear >= scale.yearMin && treatmentYear <= scale.yearMax
        ? treatmentYear
        : null
    return {
      pts,
      scale,
      boundary,
      observed: lineFor(pts, 'observed', scale),
      synthetic: lineFor(pts, 'synthetic', scale),
      effect: effectAreaPath(pts, scale, boundary),
      fitBand: preTreatmentBand(scale, boundary),
      ticks: yearTicks(scale),
    }
  }, [series, treatmentYear])

  if (!data) {
    return (
      <section className="ins-sdid" aria-labelledby="ins-sdid-title">
        <h2 id="ins-sdid-title" className="ins-band-title">Synthetic control</h2>
        <p className="ins-empty">
          No synthetic-control curve was published for this country — there is no
          counterfactual to draw against the observed series.
        </p>
      </section>
    )
  }

  const { scale, boundary, observed, synthetic, effect, fitBand, ticks, pts } = data
  const boundaryX = boundary !== null ? scale.toX(boundary) : null
  const flipLabel = boundaryX !== null && boundaryX > VB_W - PAD_R - LABEL_W
  const last = pts[pts.length - 1]
  const lastX = scale.toX(last.year)
  const lastY = scale.toY(last.observed)
  const flipLastLabel = lastX > VB_W - PAD_R - LABEL_W

  return (
    <section className="ins-sdid" aria-labelledby="ins-sdid-title">
      <h2 id="ins-sdid-title" className="ins-band-title">Synthetic control</h2>

      <div className="ins-chart">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label="Observed PM2.5 against the synthetic counterfactual, by year">
          {effect ? (
            <defs>
              {/* Grammar rule 2 (area fill) applied to the one area this chart
                  already draws for an honest reason — the post-treatment
                  effect — rather than adding a new area under either line.
                  This chart's own docstring rejects shading anything down to
                  a baseline that was not measured; a gradient on a
                  fabricated area would repeat that mistake with a nicer
                  fade. */}
              <linearGradient id="ins-sdid-effect-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" className="ins-sdid-effect-stop-a" />
                <stop offset="100%" className="ins-sdid-effect-stop-b" />
              </linearGradient>
            </defs>
          ) : null}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const v = scale.yMin + (scale.yMax - scale.yMin) * f
            return (
              <g key={f}>
                <line
                  x1={PAD_L}
                  x2={VB_W - PAD_R}
                  y1={scale.toY(v)}
                  y2={scale.toY(v)}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeWidth={0.5}
                />
                <text x={PAD_L - 6} y={scale.toY(v) + 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.6} className="num">
                  {v.toFixed(0)}
                </text>
              </g>
            )
          })}

          {fitBand ? (
            <rect
              x={fitBand.x}
              y={PAD_T}
              width={fitBand.width}
              height={VB_H - PAD_T - PAD_B}
              className="ins-sdid-fitband"
            />
          ) : null}

          {effect ? <path d={effect} className="ins-sdid-effect" /> : null}

          {/* Synthetic keeps its dash pattern rather than joining the draw-on
              reveal below — pathLength normalization (the no-JS technique
              used on `observed`) would rescale that pattern's 5/4 unit dashes
              against the path's full length instead, shrinking them to slivers. */}
          <path d={synthetic} fill="none" className="ins-sdid-line ins-sdid-line--synthetic" />
          <path
            d={observed}
            fill="none"
            pathLength={1}
            className="ins-sdid-line ins-sdid-line--observed ins-sdid-line--draw"
          />

          <circle cx={lastX} cy={lastY} r={3.5} className="ins-sdid-dot" />
          <text
            x={flipLastLabel ? lastX - 8 : lastX + 8}
            y={lastY - 8}
            textAnchor={flipLastLabel ? 'end' : 'start'}
            fontSize={11}
            fontWeight={700}
            className="ins-sdid-dot-label num"
          >
            {last.observed.toFixed(1)}
          </text>

          {boundaryX !== null ? (
            <g>
              <line x1={boundaryX} x2={boundaryX} y1={PAD_T} y2={VB_H - PAD_B} className="ins-sdid-needle" />
              <text
                x={flipLabel ? boundaryX - 6 : boundaryX + 6}
                y={PAD_T + 12}
                textAnchor={flipLabel ? 'end' : 'start'}
                fontSize={10}
                className="ins-sdid-needle-label"
              >
                TREATMENT {boundary}
              </text>
            </g>
          ) : null}

          {ticks.map((y) => (
            <text key={y} x={scale.toX(y)} y={VB_H - PAD_B + 14} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.55} className="num">
              {y}
            </text>
          ))}

          <text x={PAD_L} y={PAD_T - 6} fontSize={9.5} fill="currentColor" fillOpacity={0.7}>
            {unit}
          </text>
        </svg>
      </div>

      <div className="ins-legend">
        <span className="ins-legend-row"><span className="ins-swatch ins-swatch--observed" /> Observed</span>
        <span className="ins-legend-row"><span className="ins-swatch ins-swatch--synthetic" /> Synthetic control</span>
        {effect ? (
          <span className="ins-legend-row"><span className="ins-swatch ins-swatch--effect" /> Estimated effect</span>
        ) : null}
        {fitBand ? (
          <span className="ins-legend-row"><span className="ins-swatch ins-swatch--fit" /> Model fit window</span>
        ) : null}
      </div>

      <p className="ins-note">
        {boundary === null
          ? 'No treatment year was analysed for this country, so nothing is shaded — the two lines are shown for their divergence only, which is descriptive and not a causal effect.'
          : 'Before the needle, the gap between the lines is model fit error and carries no causal meaning. After it, the shaded gap is the estimated effect: observed minus synthetic control.'}
      </p>
    </section>
  )
}
