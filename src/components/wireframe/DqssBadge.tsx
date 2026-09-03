/**
 * DqssBadge — Data Quality Sufficiency Score 5-grade badge (Glass-box).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/DqssBadge.tsx.
 *
 * `unknown` 6th grade = NaN fallback (variance/tamper-suspected fallback).
 * Style: mono uppercase 10px, ink/paper inversion by grade.
 */

export type DqssGrade = 'A' | 'B' | 'C' | 'D' | 'F' | 'unknown'

export interface DqssBadgeProps {
  /** 5-grade DQSS result. `unknown` = NaN / tamper-suspected fallback. */
  dqss: DqssGrade
  /** Optional p10-p90 hint (compact range label) — Glass-box signal alongside the grade. */
  p10?: number | null
  p90?: number | null
  /** `compact` = letter only / `default` = DQSS + letter / `verbose` = DQSS + letter + range. */
  variant?: 'compact' | 'default' | 'verbose'
  /** Optional unit for p10/p90 range (verbose variant). */
  unit?: string
  /**
   * Prefix label. Default 'DQSS' (sensor Data Quality Scoring System). Callers
   * badging a *different* A–F quantity (e.g. self-trained-model prediction
   * confidence, `CityPredictionCard`) must override this — reusing the "DQSS"
   * prefix on a non-DQSS grade misrepresents its provenance (§5 Glass-box).
   */
  label?: string
  className?: string
}

const GRADE_LABEL: Record<DqssGrade, string> = {
  A: 'Excellent',
  B: 'Good',
  C: 'Fair',
  D: 'Poor',
  F: 'Failed',
  unknown: 'Unknown',
}

function formatBound(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toFixed(1)
}

export default function DqssBadge({
  dqss,
  p10,
  p90,
  variant = 'default',
  unit,
  label = 'DQSS',
  className,
}: DqssBadgeProps) {
  const classes = ['dqss-badge', `dqss-badge--${variant}`]
  if (className) classes.push(className)

  const letter = dqss === 'unknown' ? '—' : dqss
  const description = GRADE_LABEL[dqss]
  const rangeLabel = variant === 'verbose'
    ? `p10 ${formatBound(p10)} – p90 ${formatBound(p90)}${unit ? ` ${unit}` : ''}`
    : null

  return (
    <span
      className={classes.join(' ')}
      data-dqss={dqss}
      aria-label={`${label} ${letter} — ${description}`}
      role="status"
    >
      {variant !== 'compact' && <span className="dqss-badge-prefix">{label}</span>}
      <span className="dqss-badge-letter">{letter}</span>
      {rangeLabel ? <span className="dqss-badge-range">{rangeLabel}</span> : null}
    </span>
  )
}
