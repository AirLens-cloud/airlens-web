/**
 * Display formatting for SDID readouts.
 *
 * The monorepo had four copies of `formatAtt` and two of `formatCi` scattered
 * across Home, Insights, and PolicyDetailPanel; they had already drifted on the
 * em-dash-for-null question. One definition here, because "no estimate" has to
 * look the same everywhere or it stops reading as a state.
 */

/** A signed ATT in µg/m³, or '—' when there is no estimate. Never 0 for null. */
export function formatAtt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
}

/** The 95% interval, or '—' when either bound is missing. */
export function formatCi(low?: number | null, high?: number | null): string {
  if (low === null || low === undefined || !Number.isFinite(low)) return '—'
  if (high === null || high === undefined || !Number.isFinite(high)) return '—'
  return `${low.toFixed(2)} to ${high.toFixed(2)}`
}

/** A p-value in threshold buckets — no false precision below 0.01. */
export function formatP(p?: number | null): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—'
  if (p < 0.01) return 'p < 0.01'
  if (p < 0.05) return 'p < 0.05'
  return `p = ${p.toFixed(3)}`
}
