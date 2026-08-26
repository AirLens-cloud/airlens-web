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
        labelY: toY(last.pm25),
      }
    })

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
    const flush = (): void => {
      if (run.length >= 2) {
        const top = run.map((pt, j) => `${j === 0 ? 'M' : 'L'} ${toX(pt.year).toFixed(1)} ${toY(pt.p90 as number).toFixed(1)}`).join(' ')
        const bottom = [...run].reverse().map((pt) => `L ${toX(pt.year).toFixed(1)} ${toY(pt.p10 as number).toFixed(1)}`).join(' ')
        bandRuns.push(`${top} ${bottom} Z`)
      }
      run = []
    }
    let bandYears = 0
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
        bandYears += 1
      }
      flush()
    }

    return {
      years, yMax, toX, toY, lines, bandRuns, bandYears,
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

  const { years, yMax, toX, toY, lines, bandRuns, bandYears, primaryYears, primaryName, omitted } = data
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
              <path d={ln.path} fill="none" className={`ins-trend-line ins-trend-line-${ln.idx}`} />
              <text x={VB_W - PAD_R + 6} y={ln.labelY + 3} fontSize={10} className={`ins-trend-label ins-trend-line-${ln.idx}`}>
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
          ? `The shaded band is the 10th–90th percentile of ${primaryName}'s station-day readings for that year — how much observations varied across the country, not how uncertain the mean is. It is drawn on ${bandYears} of ${primaryYears} years; the rest had a single contributing station, which publishes no spread.`
          : `No year in ${primaryName}'s series has more than one contributing station, so there is no measured spread to draw.`}
        {' '}Series from different countries can rest on different source mixes and are not strictly comparable year for year.
        {omitted > 0 ? ` ${omitted} further peer countries are not plotted.` : ''}
      </p>
    </section>
  )
}
