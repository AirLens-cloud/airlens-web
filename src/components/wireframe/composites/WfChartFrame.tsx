/**
 * WfChartFrame — chart wrapper with p10-p90 band + CI label (Glass-box doctrine).
 * Ported from AirLens-platform apps/web/src/components/wireframe/composites/WfChartFrame.tsx
 * with react-i18next stripped — the two translated strings become plain-English
 * defaults, overridable via props (same shape as `t(key, fallback)`, so wiring
 * i18n back in later is a prop swap, not a rewrite).
 *
 * 3 layers:
 *   1. frame (paper-2 + dashed border)
 *   2. band-area (gradient mid-zone, p10-p90 range hint)
 *   3. chart slot (children — caller-provided SVG/Canvas; this repo has no
 *      d3-scale dependency, so the chart body itself is always caller-supplied)
 *
 * Empty state ("the grammar of absence"): hatched fill (never a blank/silent
 * void) + `DQSS —` + `N={n}` (0 unless the caller knows a real sample count)
 * + one of two honest captions — `emptyReason: 'no_measurement'` (nothing was
 * observed here, default) vs `'collection_failure'` (a source was expected
 * but the fetch/pipeline failed) — never a single ambiguous "unavailable"
 * that hides which one it is.
 */

import type { ReactNode } from 'react'
import DqssBadge, { type DqssGrade } from '../DqssBadge'

export type WfChartFrameEmptyReason = 'no_measurement' | 'collection_failure'

export interface WfChartFrameProps {
  /** Chart title (uppercase mono small). */
  title: string
  /** 10th percentile (lower uncertainty bound). NaN/null -> empty state. */
  p10: number | null
  /** Median (50th percentile, optional). */
  p50?: number | null
  /** 90th percentile (upper uncertainty bound). NaN/null -> empty state. */
  p90: number | null
  /** DQSS grade. 'unknown' for NaN / suspected tampering fallback. */
  dqss: DqssGrade
  /** Unit label (µg/m³ / USD / lives etc.). */
  unit?: string
  /** Optional CI level label (default 95). */
  ciLevel?: number
  /** `baseline` split — counterfactual reference line label. */
  baselineLabel?: string
  /** `treated` split — observed/predicted line label. */
  treatedLabel?: string
  /** Chart implementation slot — SVG/Canvas. caller responsibility. */
  children?: ReactNode
  /** Optional methodology footer (WfNote slot). */
  footer?: ReactNode
  /**
   * Sample count backing this chart. Rendered verbatim as `N={n}` in the
   * empty state — omit only when the caller genuinely doesn't know the
   * count (renders `N=0`, the honest default: no known observations).
   */
  n?: number
  /** Why the empty state fired — never observed vs. a failed collection. Default 'no_measurement'. */
  emptyReason?: WfChartFrameEmptyReason
  className?: string
  /** Plain-string overrides for the two empty-state captions (i18n-ready props). */
  collectionFailureLabel?: string
  noMeasurementLabel?: string
}

function formatBound(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toFixed(1)
}

export default function WfChartFrame({
  title,
  p10,
  p50,
  p90,
  dqss,
  unit = '',
  ciLevel = 95,
  baselineLabel,
  treatedLabel,
  children,
  footer,
  n,
  emptyReason = 'no_measurement',
  className,
  collectionFailureLabel = 'Collection failure — could not reach the data source',
  noMeasurementLabel = 'Not measured — no observations in this range',
}: WfChartFrameProps) {
  const isEmpty = p10 === null || p90 === null || !Number.isFinite(p10) || !Number.isFinite(p90)

  const classes = ['wf-chart-frame']
  if (isEmpty) classes.push('wf-chart-frame--empty')
  if (className) classes.push(className)

  return (
    <figure className={classes.join(' ')} data-empty={isEmpty ? 'true' : 'false'}>
      <header className="wf-chart-frame-head">
        <span className="wf-chart-frame-title">{title}</span>
        <DqssBadge
          dqss={dqss}
          p10={p10 ?? null}
          p90={p90 ?? null}
          unit={unit}
          variant="default"
        />
      </header>

      <div className="wf-chart-frame-band" aria-hidden="true">
        <span className="band-label band-label--p10">p10 {formatBound(p10)}</span>
        <span className="band-area">
          {p50 !== undefined && p50 !== null && Number.isFinite(p50) ? (
            <span className="band-median" aria-hidden="true">p50 {formatBound(p50)}{unit ? ` ${unit}` : ''}</span>
          ) : null}
        </span>
        <span className="band-label band-label--p90">p90 {formatBound(p90)}</span>
      </div>

      <div className="wf-chart-frame-body">
        {isEmpty ? (
          <div
            className="wf-chart-frame-placeholder"
            role="status"
            data-empty-reason={emptyReason}
          >
            <span className="wf-chart-frame-placeholder-stats">
              <span>DQSS {dqss === 'unknown' ? '—' : dqss}</span>
              <span>N={Number.isFinite(n) ? n : 0}</span>
            </span>
            <span className="wf-chart-frame-placeholder-msg">
              {emptyReason === 'collection_failure' ? collectionFailureLabel : noMeasurementLabel}
            </span>
          </div>
        ) : (
          children
        )}
      </div>

      {(baselineLabel || treatedLabel) ? (
        <div className="wf-chart-frame-legend">
          {baselineLabel ? (
            <span className="legend-item legend-baseline">
              <span className="legend-swatch legend-swatch--baseline" aria-hidden="true" />
              {baselineLabel}
            </span>
          ) : null}
          {treatedLabel ? (
            <span className="legend-item legend-treated">
              <span className="legend-swatch legend-swatch--treated" aria-hidden="true" />
              {treatedLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="wf-chart-frame-ci">
        <span className="ci-label">{ciLevel}% CI</span>
        <span className="ci-spread">±{p10 !== null && p90 !== null && Number.isFinite(p10) && Number.isFinite(p90) ? ((p90 - p10) / 2).toFixed(1) : '—'}{unit ? ` ${unit}` : ''}</span>
      </div>

      {footer ? <figcaption className="wf-chart-frame-footer">{footer}</figcaption> : null}
    </figure>
  )
}
