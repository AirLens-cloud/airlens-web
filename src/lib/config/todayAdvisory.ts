/**
 * Today advisory config — tier -> fixed judgment/action sentences for the
 * `/today` Decision surface. Every sentence here is a config constant, never
 * generated text (page-specs/today-decision-surface.md §7: "Why의 관찰된
 * 변화 문장은 rule-based 템플릿에서만 생성" / §4 Answer: "tier->문장 매핑
 * 상수(config), 의학적 조언 표현 금지").
 *
 * Deliberately separate from Home's `ACTION_SENTENCE`
 * (lib/config/homeBriefing.ts) and Weather's `TIER_ACTION`
 * (components/weather/AirQualityLine.tsx) — Today's Answer is a go/no-go
 * judgment sentence (not a one-line consumer readout), and What next splits
 * general vs. sensitive-group guidance, which neither of those maps does.
 */
import type { AqiTier } from '../../components/wireframe/AqiDot'

/** Answer — the single judgment sentence. Paired with the tier dot, this is
 * the whole "should I go out" answer; Why/What next/Evidence carry the
 * reasoning behind it. */
export const ANSWER_SENTENCE: Record<AqiTier, string> = {
  good: "It's a good day to be outside.",
  moderate: 'Air is acceptable — most people can go about their day outside.',
  usg: 'Air is degraded for sensitive groups — most people can still go outside.',
  unhealthy: 'Air is unhealthy — consider limiting time outside.',
  'very-unhealthy': 'Air is very unhealthy — consider staying indoors where possible.',
  hazardous: 'Air is hazardous — consider avoiding outdoor exposure.',
  unknown: 'No current reading is available for this location.',
}

export const GENERAL_ADVISORY: Record<AqiTier, string> = {
  good: 'No particular precautions needed.',
  moderate: 'Unusually sensitive individuals may want to watch for symptoms during extended outdoor activity.',
  usg: 'Consider shortening prolonged or heavy outdoor exertion.',
  unhealthy: 'Consider limiting outdoor exertion and keeping windows closed.',
  'very-unhealthy': 'Consider moving outdoor plans indoors where possible.',
  hazardous: 'Consider avoiding outdoor exposure entirely.',
  unknown: 'No reading is available to base guidance on.',
}

export const SENSITIVE_ADVISORY: Record<AqiTier, string> = {
  good: 'No particular precautions needed.',
  moderate: 'Watch for symptoms (coughing, shortness of breath) during extended outdoor activity.',
  usg: 'Limit prolonged or heavy outdoor exertion.',
  unhealthy: 'Limit outdoor exertion — consider a mask outdoors.',
  'very-unhealthy': 'Avoid outdoor exertion — stay indoors where possible.',
  hazardous: 'Stay indoors and avoid outdoor exposure.',
  unknown: 'No reading is available to base guidance on.',
}

/** Renders next to the Answer meta line — this is guidance, not a medical
 * diagnosis (page-specs/today-decision-surface.md §4). */
export const NOT_MEDICAL_ADVICE = 'NOT MEDICAL ADVICE — general guidance only, not a diagnosis.'
