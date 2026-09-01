/**
 * TodayAnswer — ① Answer. The single judgment sentence (tier -> fixed
 * config text, `todayAdvisory.ts`) plus a one-line meta strip: city, PM2.5,
 * tier, valid time, and the "not medical advice" disclaimer
 * (page-specs/today-decision-surface.md §4).
 */
import AqiDot from '../wireframe/AqiDot'
import { ANSWER_SENTENCE, NOT_MEDICAL_ADVICE } from '../../lib/config/todayAdvisory'
import { TIER_LABEL } from '../../lib/config/homeBriefing'
import { formatUtcTime } from '../../lib/home/whyNow'
import type { AqiTier } from '../wireframe/AqiDot'

export interface TodayAnswerProps {
  tier: AqiTier
  pm25: number | null
  city: string
  countryCode: string | null
  validTimeIso: string | null
}

export default function TodayAnswer({ tier, pm25, city, countryCode, validTimeIso }: TodayAnswerProps) {
  return (
    <section className="today-answer" aria-label="Decision">
      <div className="today-answer__row">
        <AqiDot tier={tier} size={20} />
        <p className="today-answer__sentence">{ANSWER_SENTENCE[tier]}</p>
      </div>
      <p className="today-answer__meta t-micro">
        {city}
        {countryCode ? `, ${countryCode}` : ''}
        {pm25 !== null ? (
          <>
            {' · '}
            {Math.round(pm25)} µg/m³ PM2.5
          </>
        ) : null}
        {' · '}
        {TIER_LABEL[tier]}
        {validTimeIso ? (
          <>
            {' · '}Valid {formatUtcTime(validTimeIso)}
          </>
        ) : null}
        {' · '}
        {NOT_MEDICAL_ADVICE}
      </p>
    </section>
  )
}
