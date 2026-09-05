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

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * "26 Aug 2026 · 9 days ago" from an ISO timestamp (fractional seconds and a
 * UTC offset both allowed — the fraction is trimmed to 3 digits before
 * parsing, since ECMA-262 only guarantees `Date.parse` for exactly-3-digit
 * fractions and the pipeline emits 6; anything longer is
 * implementation-defined and WebKit is not guaranteed to accept it). `nowMs` is a
 * parameter rather than an internal `Date.now()` read so a test can pin it
 * instead of racing the real clock. Returns null only when the timestamp
 * itself does not parse — never fabricated for the raw "date" half.
 *
 * The date half is built from a fixed month-name table rather than
 * `Intl.DateTimeFormat`: `en-GB`'s CLDR data abbreviates September as "Sept"
 * on some ICU builds and "Sep" on others, which would make this string (and
 * any test pinning it) depend on the runtime's bundled ICU version rather
 * than the timestamp.
 *
 * A future timestamp (client clock skew) drops the relative half rather than
 * printing a negative age — the absolute date still stands.
 */
export function formatEstimatedTimestamp(iso: string, nowMs: number = Date.now()): string | null {
  const ms = Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'))
  if (Number.isNaN(ms)) return null

  const d = new Date(ms)
  const dateStr = `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`

  const elapsedMs = nowMs - ms
  if (elapsedMs < 0) return dateStr

  const minutes = Math.floor(elapsedMs / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  let relative: string
  if (days >= 1) {
    relative = `${days} day${days === 1 ? '' : 's'} ago`
  } else if (hours >= 1) {
    relative = `${hours} hour${hours === 1 ? '' : 's'} ago`
  } else {
    const displayMinutes = Math.max(1, minutes)
    relative = `${displayMinutes} minute${displayMinutes === 1 ? '' : 's'} ago`
  }

  return `${dateStr} · ${relative}`
}
