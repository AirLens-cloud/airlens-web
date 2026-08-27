// insightsAttScale — pure geometry for InsightsAttChart (no React).
//
// SDID synthetic-control viz: a continuous YEAR axis with two lines — observed
// PM2.5 vs synthetic counterfactual — and a post-treatment effect band (the
// honest signal). Split out so the chart is a single-export module (Fast
// Refresh) and the math is unit-testable. No fabricated uncertainty (Glass-box).
import type { SdidPoint } from '../../types/policy'

export const VB_W = 800
export const VB_H = 320
export const PAD_L = 56
export const PAD_R = 24
export const PAD_T = 24
export const PAD_B = 44

export interface SdidScale {
  yearMin: number
  yearMax: number
  yMin: number
  yMax: number
  toX: (year: number) => number
  toY: (v: number) => number
}

/** Drop non-finite points, sort by year. */
export function cleanSeries(series: SdidPoint[]): SdidPoint[] {
  return series
    .filter((p) => [p.year, p.observed, p.synthetic].every(Number.isFinite))
    .slice()
    .sort((a, b) => a.year - b.year)
}

export function buildSdidScale(series: SdidPoint[]): SdidScale {
  const years = series.map((p) => p.year)
  const yearMin = Math.min(...years)
  const yearMax = Math.max(...years)
  const vals: number[] = []
  for (const p of series) vals.push(p.observed, p.synthetic)
  const yMinRaw = Math.min(...vals)
  const yMaxRaw = Math.max(...vals)
  const pad = (yMaxRaw - yMinRaw) * 0.08 || 4
  const yMin = Math.max(0, Math.floor((yMinRaw - pad) / 5) * 5)
  const yMax = Math.ceil((yMaxRaw + pad) / 5) * 5
  const innerW = VB_W - PAD_L - PAD_R
  const innerH = VB_H - PAD_T - PAD_B
  const span = yearMax - yearMin
  const toX = (year: number): number =>
    PAD_L + (span === 0 ? innerW / 2 : ((year - yearMin) / span) * innerW)
  const toY = (v: number): number =>
    PAD_T + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH
  return { yearMin, yearMax, yMin, yMax, toX, toY }
}

export function lineFor(series: SdidPoint[], key: 'observed' | 'synthetic', scale: SdidScale): string {
  return series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scale.toX(p.year).toFixed(1)} ${scale.toY(p[key]).toFixed(1)}`)
    .join(' ')
}

/**
 * Effect band = the gap between observed and synthetic, POST-treatment only.
 * The pre-treatment gap is model fit error (not an effect), so it is never
 * shaded. Returns '' when there is no usable post-treatment span.
 */
export function effectAreaPath(series: SdidPoint[], scale: SdidScale, boundaryYear: number | null): string {
  if (boundaryYear === null) return ''
  const post = series.filter((p) => p.year >= boundaryYear)
  if (post.length < 2) return ''
  const top = post
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scale.toX(p.year).toFixed(1)} ${scale.toY(p.observed).toFixed(1)}`)
    .join(' ')
  const bottom = post
    .slice()
    .reverse()
    .map((p) => `L ${scale.toX(p.year).toFixed(1)} ${scale.toY(p.synthetic).toFixed(1)}`)
    .join(' ')
  return `${top} ${bottom} Z`
}

/** Integer year ticks across the domain, thinned to ~maxLabels. */
export function yearTicks(scale: SdidScale, maxLabels = 6): number[] {
  const span = scale.yearMax - scale.yearMin
  if (span <= 0) return [scale.yearMin]
  const step = Math.max(1, Math.ceil((span + 1) / maxLabels))
  const out: number[] = []
  for (let y = scale.yearMin; y <= scale.yearMax; y += step) out.push(y)
  if (out[out.length - 1] !== scale.yearMax) out.push(scale.yearMax)
  return out
}

/**
 * Nearest series year to an arbitrary `target` (e.g. a page-level scrub year
 * from a sibling view whose own year domain may not include `target`
 * exactly — the InsightsAttChart crosshair snaps external sync input onto
 * its own data points, never fabricating an in-between year). Ties resolve
 * to the earlier year. `null` for an empty series.
 */
export function nearestSeriesYear(series: SdidPoint[], target: number): number | null {
  if (series.length === 0) return null
  let best = series[0].year
  let bestDist = Math.abs(series[0].year - target)
  for (let i = 1; i < series.length; i++) {
    const d = Math.abs(series[i].year - target)
    if (d < bestDist) {
      bestDist = d
      best = series[i].year
    }
  }
  return best
}

/**
 * Pre-treatment shading bounds — the synthetic-control MODEL FIT window
 * (series start → `boundaryYear`, exclusive of the post-treatment effect
 * band). Honest labeling only: this is fit region, never rendered/legended
 * as an effect. `null` when there's no meaningful pre-period.
 */
export function preTreatmentBand(scale: SdidScale, boundaryYear: number | null): { x: number; width: number } | null {
  if (boundaryYear === null || boundaryYear <= scale.yearMin) return null
  const x0 = scale.toX(scale.yearMin)
  const x1 = scale.toX(Math.min(boundaryYear, scale.yearMax))
  const width = x1 - x0
  return width > 0 ? { x: x0, width } : null
}
