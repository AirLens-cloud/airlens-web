/**
 * PolicyLimitBars — band 2b. What each country's own annual PM2.5 standard
 * permits, against the WHO guideline.
 *
 * Adapted from AirLens-platform `apps/web/src/components/insights/PolicyLimitBars.tsx`.
 * The source read a `CountryStandard[]` from a Supabase-backed comparison API;
 * here the same two numbers already travel on `policy-impact/index.json`
 * (`pm25AnnualStandard`), so the chart is driven from the catalogue the page
 * has already loaded, with no second feed.
 *
 * Regulatory limits are legal facts, not estimates: no uncertainty band belongs
 * on this chart. The WHO line is the benchmark that makes the numbers legible.
 */
import { useMemo } from 'react'
import { WHO_PM25_ANNUAL_GUIDELINE } from '../../lib/config/countryCenters'
import type { AnalysedCountry } from '../../hooks/useInsightsData'

export interface PolicyLimitBarsProps {
  /** Peer set to compare — the caller decides who is a peer. */
  countries: AnalysedCountry[]
  /** Always rendered, even if it has no standard, so the reader finds it. */
  selectedCode: string
  unit?: string
  maxRows?: number
}

const VB_W = 800
const ROW_H = 40
const PAD_L = 148
const PAD_R = 72
const PAD_T = 16
const PAD_B = 30

export default function PolicyLimitBars({
  countries,
  selectedCode,
  unit = 'µg/m³',
  maxRows = 8,
}: PolicyLimitBarsProps) {
  const data = useMemo(() => {
    const withStandard = countries.filter(
      (c): c is AnalysedCountry & { pm25AnnualStandard: number } =>
        typeof c.pm25AnnualStandard === 'number' && Number.isFinite(c.pm25AnnualStandard),
    )
    if (withStandard.length === 0) return null

    // The selected country is pinned first when it has a standard; the rest are
    // ranked strictest-first so the comparison reads in one direction.
    const rest = withStandard
      .filter((c) => c.countryCode !== selectedCode)
      .sort((a, b) => a.pm25AnnualStandard - b.pm25AnnualStandard)
    const pinned = withStandard.filter((c) => c.countryCode === selectedCode)
    const rows = [...pinned, ...rest].slice(0, maxRows)

    const maxV = Math.max(...rows.map((r) => r.pm25AnnualStandard), WHO_PM25_ANNUAL_GUIDELINE)
    return {
      rows,
      maxV: maxV > 0 ? maxV : 1,
      missing: countries.length - withStandard.length,
      omitted: Math.max(0, withStandard.length - rows.length),
    }
  }, [countries, selectedCode, maxRows])

  if (!data) {
    return (
      <section className="ins-limits" aria-labelledby="ins-limits-title">
        <h2 id="ins-limits-title" className="ins-band-title">National standards</h2>
        <p className="ins-empty">
          None of these countries publishes an annual PM2.5 standard in the
          catalogue, so there is nothing to compare.
        </p>
      </section>
    )
  }

  const { rows, maxV, missing, omitted } = data
  const innerW = VB_W - PAD_L - PAD_R
  const vbH = PAD_T + PAD_B + rows.length * ROW_H
  const toW = (v: number): number => (v / maxV) * innerW
  const whoX = PAD_L + toW(WHO_PM25_ANNUAL_GUIDELINE)

  return (
    <section className="ins-limits" aria-labelledby="ins-limits-title">
      <h2 id="ins-limits-title" className="ins-band-title">National standards</h2>

      <div className="ins-chart">
        <svg viewBox={`0 0 ${VB_W} ${vbH}`} role="img" aria-label="Annual PM2.5 standard by country, against the WHO guideline">
          <g>
            <line
              x1={whoX}
              x2={whoX}
              y1={PAD_T}
              y2={vbH - PAD_B}
              stroke="currentColor"
              strokeOpacity={0.5}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text x={whoX} y={vbH - PAD_B + 16} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.7}>
              WHO {WHO_PM25_ANNUAL_GUIDELINE}
            </text>
          </g>

          {rows.map((r, i) => {
            const y = PAD_T + i * ROW_H
            const barW = Math.max(2, toW(r.pm25AnnualStandard))
            const ratio = r.pm25AnnualStandard / WHO_PM25_ANNUAL_GUIDELINE
            return (
              <g key={r.countryCode}>
                <text
                  x={PAD_L - 10}
                  y={y + ROW_H / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={12}
                  fill="currentColor"
                  className="ins-bar-label"
                >
                  {r.flag ? `${r.flag} ` : ''}
                  {r.name}
                </text>
                <rect
                  x={PAD_L}
                  y={y + 8}
                  width={barW}
                  height={ROW_H - 18}
                  className={`ins-bar${r.countryCode === selectedCode ? ' ins-bar--active' : ''}`}
                />
                <text
                  x={PAD_L + barW + 6}
                  y={y + ROW_H / 2}
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="currentColor"
                  className="ins-bar-value num"
                >
                  {r.pm25AnnualStandard} {unit} · {ratio.toFixed(1)}× WHO
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <p className="ins-note">
        Annual mean limits as legislated, against the WHO 2021 guideline of{' '}
        {WHO_PM25_ANNUAL_GUIDELINE} {unit}. A limit is what a country permits,
        not what it measures — the observed series is the band below.
        {missing > 0 ? ` ${missing} of these countries publish no annual standard in the catalogue.` : ''}
        {omitted > 0 ? ` ${omitted} further countries with a standard are not shown.` : ''}
      </p>
    </section>
  )
}
