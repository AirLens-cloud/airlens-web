/**
 * Shared DQSS-shaped grade parsing. Split out from `DqssBadge.tsx` itself
 * (rather than co-located there) because a value export from a component
 * file breaks Fast Refresh — `react-refresh/only-export-components` requires
 * that file to export components only.
 *
 * Any card badging an A–F quantity against `DqssBadge`'s `DqssGrade` type
 * (`CityPredictionCard`, `ForecastBandCard`) reads through this, so "never
 * invent a grade" lives in one place instead of two duplicated copies.
 */
import type { DqssGrade } from '../components/wireframe/DqssBadge'

const VALID_GRADES: ReadonlySet<string> = new Set(['A', 'B', 'C', 'D', 'F'])

/** null / missing / unrecognised string → 'unknown'. No grade is ever invented. */
export function toDqssGrade(raw: string | null | undefined): DqssGrade {
  return raw != null && VALID_GRADES.has(raw) ? (raw as DqssGrade) : 'unknown'
}
