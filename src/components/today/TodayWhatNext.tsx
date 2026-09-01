/**
 * TodayWhatNext — ③ What next. General vs. sensitive-group guidance as
 * separate sentences (tier -> fixed config text, `todayAdvisory.ts`), plus a
 * confidence line naming how many of the two connected sources (GRID/CAMS —
 * GOOGLE is never connected, so it is not counted) agree on the tier
 * (page-specs/today-decision-surface.md §4).
 */
import { GENERAL_ADVISORY, SENSITIVE_ADVISORY } from '../../lib/config/todayAdvisory'
import type { AqiTier } from '../wireframe/AqiDot'

export interface TodayWhatNextProps {
  tier: AqiTier
  /** How many of the (up to 2) connected sources agree on `tier`. */
  agreeCount: number
}

export default function TodayWhatNext({ tier, agreeCount }: TodayWhatNextProps) {
  return (
    <section className="today-what-next" aria-label="What next">
      <h2 className="today-panel__title m">WHAT NEXT</h2>
      <p className="today-what-next__general t-caption">
        <strong className="m">GENERAL</strong> {GENERAL_ADVISORY[tier]}
      </p>
      <p className="today-what-next__sensitive t-caption">
        <strong className="m">SENSITIVE GROUPS</strong> {SENSITIVE_ADVISORY[tier]}
      </p>
      <p className="today-what-next__confidence t-micro">
        {agreeCount}/2 sources agree on tier · rule: tier→sentence map · not a diagnosis.
      </p>
    </section>
  )
}
