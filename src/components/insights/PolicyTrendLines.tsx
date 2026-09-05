/**
 * PolicyTrendLines — band 5. Observed annual PM2.5 for the selected country and
 * its peers, with the measured spread drawn behind the selected line.
 *
 * Adapted from AirLens-platform `apps/web/src/components/insights/PolicyTrendLines.tsx`.
 * The source drew a pastel area from each line down to the axis — decoration
 * that read as a magnitude. This version replaces it with the one band the data
 * supports: the p10–p90 range of that year's station-day observations, as
 * published, for the selected country only.
 *
 * Two rules that band lives by:
 *  - It is SPREAD, not uncertainty. It says how much readings varied across the
 *    country's stations and days, not how confident anyone is in the mean.
 *  - It is drawn only where p90 > p10. A year with one contributing station
 *    publishes p10 == p90 == mean; painting that as a zero-width band would
 *    imply a precision measurement rather than a single sensor.
 */
import { useMemo } from 'react'
import type { CountryPanel, CountryPanelPoint } from '../../types/policy'

export interface PolicyTrendLinesProps {
  /** Selected country first — it owns the band. */
  panels: CountryPanel[]
  selectedCode: string
  unit?: string
}

const VB_W = 800
const VB_H = 320
const PAD_L = 48
const PAD_R = 76
const PAD_T = 20
const PAD_B = 36
const MAX_SERIES = 4
// An endpoint label is two stacked 10px text lines (value + flag); the group
// needs this much vertical room before it collides with its neighbour.
// Exported for the de-overlap tests, so their gap assertions track this value.
export const LABEL_GAP = 26

export default function PolicyTrendLines({
  panels,
  selectedCode,
  unit = 'µg/m³',
}: PolicyTrendLinesProps) {
  const data = useMemo(() => {
    const withPoints = panels.filter((p) => p.points.length > 0)
    if (withPoints.length === 0) return null

    // The selected country is always a series, and always the one with a band.
    const primary = withPoints.find((p) => p.countryCode === selectedCode)
    const peers = withPoints.filter((p) => p.countryCode !== selectedCode)
    const shown = (primary ? [primary, ...peers] : peers).slice(0, MAX_SERIES)
    if (shown.length === 0) return null

    const years = [...new Set(shown.flatMap((p) => p.points.map((pt) => pt.year)))].sort((a, b) => a - b)
    // The band can exceed every mean, so the y domain has to see it too —
    // otherwise the top of the spread is clipped and the chart understates it.
    const values = shown.flatMap((p) =>
      p.points.flatMap((pt) => [pt.pm25, ...(p === primary && pt.p90 !== null ? [pt.p90] : [])]),
    )
    const yMax = Math.ceil((Math.max(...values) * 1.08) / 5) * 5 || 5
    const xMin = years[0]
    const xMax = years[years.length - 1]
    const innerW = VB_W - PAD_L - PAD_R
    const innerH = VB_H - PAD_T - PAD_B
    const toX = (yr: number): number =>
      PAD_L + (xMax === xMin ? innerW / 2 : ((yr - xMin) / (xMax - xMin)) * innerW)
    const toY = (v: number): number => PAD_T + innerH - (v / yMax) * innerH

    const lines = shown.map((p, i) => {
      const last = p.points[p.points.length - 1]
      return {
        countryCode: p.countryCode,
        countryName: p.countryName ?? p.countryCode,
        flag: p.flag,
        idx: i,
        path: p.points
          .map((pt, j) => `${j === 0 ? 'M' : 'L'} ${toX(pt.year).toFixed(1)} ${toY(pt.pm25).toFixed(1)}`)
          .join(' '),
        lastX: toX(last.year),
        lastValue: last.pm25,
        labelY: toY(last.pm25),
        labelTextY: toY(last.pm25),
      }
    })

    // Series whose final values land close together would draw their endpoint
    // labels on top of each other. Only the text moves to make room — the dot
    // stays at the true data y, so the label's offset never misstates where
    // the series actually ends.
    const byY = [...lines].sort((a, b) => a.labelY - b.labelY)
    const labelMinY = PAD_T + 8
    const labelMaxY = VB_H - PAD_B
    let prevY = -Infinity
    for (const ln of byY) {
      ln.labelTextY = Math.max(ln.labelY, labelMinY, prevY + LABEL_GAP)
      prevY = ln.labelTextY
    }
    // The forward pass only pushes down; if the bottom label overflowed the
    // plot, pull the run back up while keeping the gaps it just earned.
    // MAX_SERIES * LABEL_GAP is well under the plot height, so this always fits.
    let nextY = labelMaxY
    for (let i = byY.length - 1; i >= 0; i--) {
      byY[i].labelTextY = Math.min(byY[i].labelTextY, nextY)
      nextY = byY[i].labelTextY - LABEL_GAP
    }

    // Contiguous runs of years that published a non-degenerate spread. A gap
    // breaks the polygon rather than bridging across a year that has no band —
    // bridging would draw a spread nobody measured.
    //
    // TWO kinds of gap have to break it. A year present in the panel with no
    // usable spread trips the `else`; a year MISSING from the panel entirely
    // (dropped by `mapPoints` because it published no usable mean) never
    // appears in this loop at all, so the run has to check year contiguity too.
    // Without that check, 2017 and 2019 with 2018 absent join into one polygon
    // whose straight edge asserts a spread across 2018.
    const bandRuns: string[] = []
    let run: CountryPanelPoint[] = []
    // Counted at flush, not at push: a year whose spread ends up alone in a
    // one-point run is discarded below and never drawn, so counting it when it
    // was pushed would make the caption claim more coverage than the chart
    // shows. The caption is about what is on screen.
    let bandYears = 0
    // Years that published a usable spread at all, drawn or not. The gap
    // between this and `bandYears` is years whose spread exists but has no
    // adjacent year to form a polygon with — a real state the caption owes the
    // reader, since otherwise those years read as "no spread was measured".
    let spreadYears = 0
    const flush = (): void => {
      if (run.length >= 2) {
        const top = run.map((pt, j) => `${j === 0 ? 'M' : 'L'} ${toX(pt.year).toFixed(1)} ${toY(pt.p90 as number).toFixed(1)}`).join(' ')
        const bottom = [...run].reverse().map((pt) => `L ${toX(pt.year).toFixed(1)} ${toY(pt.p10 as number).toFixed(1)}`).join(' ')
        bandRuns.push(`${top} ${bottom} Z`)
        bandYears += run.length
      }
      run = []
    }
    if (primary) {
      for (const pt of primary.points) {
        const hasSpread = pt.p10 !== null && pt.p90 !== null && pt.p90 > pt.p10
        if (!hasSpread) {
          flush()
          continue
        }
        const prev = run[run.length - 1]
        if (prev && pt.year !== prev.year + 1) flush()
        run.push(pt)
        spreadYears += 1
      }
      flush()
    }

    return {
      years, yMax, toX, toY, lines, bandRuns, bandYears, spreadYears,
      primaryYears: primary?.points.length ?? 0,
      primaryName: primary?.countryName ?? selectedCode,
      omitted: Math.max(0, withPoints.length - shown.length),
    }
  }, [panels, selectedCode])

  if (!data) {
    return (
      <section className="ins-trend" aria-labelledby="ins-trend-title">
        <h2 id="ins-trend-title" className="ins-band-title">Observed trend</h2>
        <p className="ins-empty">No observed PM2.5 series is published for these countries.</p>
      </section>
    )
  }

  const { years, yMax, toX, toY, lines, bandRuns, bandYears, spreadYears, primaryYears, primaryName, omitted } = data
  // Years with a spread that no polygon could be built from — an isolated year
  // between two that published none. Named rather than folded into "the rest".
  const isolatedSpreadYears = spreadYears - bandYears
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f)
  const labelStep = Math.max(1, Math.ceil(years.length / 8))

  return (
    <section className="ins-trend" aria-labelledby="ins-trend-title">
      <h2 id="ins-trend-title" className="ins-band-title">Observed trend</h2>

      <div className="ins-chart">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label="Observed annual PM2.5 by year, by country">
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={PAD_L} x2={VB_W - PAD_R} y1={toY(tk)} y2={toY(tk)} stroke="currentColor" strokeOpacity={0.1} strokeWidth={0.5} />
              <text x={PAD_L - 6} y={toY(tk) + 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.6} className="num">
                {tk.toFixed(0)}
              </text>
            </g>
          ))}

          {bandRuns.map((d, i) => (
            <path key={`band-${i}`} d={d} className="ins-trend-band" />
          ))}

          {lines.map((ln) => (
            <g key={ln.countryCode}>
              <path
                d={ln.path}
                fill="none"
                pathLength={1}
                className={`ins-trend-line ins-trend-line-draw ins-trend-line-${ln.idx}`}
                style={{ animationDelay: `${ln.idx * 120}ms` }}
              />
              <circle cx={ln.lastX} cy={ln.labelY} r={3} className={`ins-trend-dot ins-trend-line-${ln.idx}`} />
              <text x={VB_W - PAD_R + 6} y={ln.labelTextY - 5} fontSize={10} fontWeight={700} className="ins-trend-value num">
                {ln.lastValue.toFixed(1)}
              </text>
              <text x={VB_W - PAD_R + 6} y={ln.labelTextY + 8} fontSize={10} className={`ins-trend-label ins-trend-line-${ln.idx}`}>
                {ln.flag ?? ln.countryCode}
              </text>
            </g>
          ))}

          {years.filter((_, i) => i % labelStep === 0).map((yr) => (
            <text key={yr} x={toX(yr)} y={VB_H - PAD_B + 14} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.55} className="num">
              {yr}
            </text>
          ))}

          <text x={PAD_L} y={PAD_T - 6} fontSize={9.5} fill="currentColor" fillOpacity={0.7}>{unit}</text>
        </svg>
      </div>

      <div className="ins-legend">
        {lines.map((ln) => (
          <span key={ln.countryCode} className="ins-legend-row">
            <span className={`ins-swatch ins-trend-line-${ln.idx}`} />
            {ln.flag ? `${ln.flag} ` : ''}{ln.countryName}
          </span>
        ))}
        {bandRuns.length > 0 ? (
          <span className="ins-legend-row"><span className="ins-swatch ins-swatch--spread" /> p10–p90 spread</span>
        ) : null}
      </div>

      <p className="ins-note">
        {bandYears > 0
          ? `The shaded band is the 10th–90th percentile of ${primaryName}'s station-day readings for that year — how much observations varied across the country, not how uncertain the mean is. It is drawn on ${bandYears} of ${primaryYears} years; the rest published no spread, which is what a year with a single contributing station looks like.`
          : `No band is drawn: no two adjacent years in ${primaryName}'s series both published a spread, and a single year cannot form one.`}
        {isolatedSpreadYears > 0
          ? ` ${isolatedSpreadYears} further ${isolatedSpreadYears === 1 ? 'year has' : 'years have'} a measured spread but no adjacent year to draw it against, so ${isolatedSpreadYears === 1 ? 'it is' : 'they are'} left undrawn rather than shown as a point.`
          : ''}
        {' '}Series from different countries can rest on different source mixes and are not strictly comparable year for year.
        {omitted > 0 ? ` ${omitted} further peer countries are not plotted.` : ''}
      </p>
    </section>
  )
}
