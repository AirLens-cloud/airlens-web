/**
 * TodayWhatNext — ③ What next. General vs. sensitive-group guidance as
 * separate sentences (tier -> fixed config text, `todayAdvisory.ts`), plus a
 * confidence line naming how many of the *actually resolved* sources
 * (GRID/CAMS — GOOGLE is never connected, so it is never counted) agree on
 * the tier. The denominator is the resolved count, not a fixed "/2" — with
 * only one source up, "1/2 agree" would misleadingly imply a cross-check
 * that never happened ("disagreement is information", page-specs
 * §1 principle 1 — the flip side is that a lone source must not be dressed
 * up as agreement either).
 */
import { GENERAL_ADVISORY, SENSITIVE_ADVISORY } from '../../lib/config/todayAdvisory'
import type { AqiTier } from '../wireframe/AqiDot'

export interface TodayWhatNextProps {
  tier: AqiTier
  /** How many of `resolvedCount` sources agree on `tier`. */
  agreeCount: number
  /** How many of the (up to 2) connected sources actually resolved — GRID/CAMS only. */
  resolvedCount: number
}

function confidenceLine(agreeCount: number, resolvedCount: number): string {
  if (resolvedCount === 0) return 'No sources available — confidence cannot be assessed · not a diagnosis.'
  if (resolvedCount === 1) return 'Single source — no cross-check available · rule: tier→sentence map · not a diagnosis.'
  return `${agreeCount}/${resolvedCount} sources agree on tier · rule: tier→sentence map · not a diagnosis.`
}

export default function TodayWhatNext({ tier, agreeCount, resolvedCount }: TodayWhatNextProps) {
  return (
    <section className="today-what-next" aria-label="What next">
      <h2 className="today-panel__title m">WHAT NEXT</h2>
      <p className="today-what-next__general t-caption">
        <strong className="m">GENERAL</strong> {GENERAL_ADVISORY[tier]}
      </p>
      <p className="today-what-next__sensitive t-caption">
        <strong className="m">SENSITIVE GROUPS</strong> {SENSITIVE_ADVISORY[tier]}
      </p>
      <p className="today-what-next__confidence t-micro">{confidenceLine(agreeCount, resolvedCount)}</p>
    </section>
  )
}
