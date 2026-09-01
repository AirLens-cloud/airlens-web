/**
 * Source agreement — GRID vs CAMS difference in µg/m³. Rule-based only: a
 * plain "sources differ by N µg/m³" fact, never smoothed into an average
 * (page-specs/today-decision-surface.md §1 principle 1, §6 AGREEMENT cell —
 * "소스 간 차이를 µg/m³로 명시").
 */
const AGREEMENT_THRESHOLD_UGM3 = 5

export interface SourceAgreement {
  diff: number
  agree: boolean
}

/** Null when either source is unavailable — "not enough sources to compare"
 * is the caller's honest render for that case, never a guessed diff. */
export function computeSourceAgreement(gridPm25: number | null, camsPm25: number | null): SourceAgreement | null {
  if (gridPm25 === null || camsPm25 === null) return null
  const diff = Math.abs(gridPm25 - camsPm25)
  return { diff, agree: diff <= AGREEMENT_THRESHOLD_UGM3 }
}
