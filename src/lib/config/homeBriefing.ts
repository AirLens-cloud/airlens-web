/**
 * Home briefing config — tier -> plain-language action sentence, tier -> the
 * hero's AQI-tint band, and the forecast staleness threshold.
 *
 * The action-sentence map is deliberately separate from `AirQualityLine`'s
 * own `TIER_ACTION` (components/weather/AirQualityLine.tsx) — that one is a
 * one-line consumer readout wired into /weather; this is the Home hero's
 * single sentence, worded to avoid medical-advice framing ("consider ...",
 * never a directive "must"/"should immediately").
 */
import type { AqiTier } from '../../components/wireframe/AqiDot'
import type { WfGlassCardAqi } from '../../components/wireframe/types'

export const TIER_LABEL: Record<AqiTier, string> = {
  good: 'Good',
  moderate: 'Moderate',
  usg: 'Unhealthy for sensitive groups',
  unhealthy: 'Unhealthy',
  'very-unhealthy': 'Very unhealthy',
  hazardous: 'Hazardous',
  unknown: 'Unknown',
}

export const ACTION_SENTENCE: Record<AqiTier, string> = {
  good: 'A good day to be outside — no particular precautions needed.',
  moderate:
    'Consider limiting extended outdoor exertion if you are unusually sensitive to particulates.',
  usg: 'Consider limiting extended outdoor exertion, especially for children, older adults, and people with respiratory conditions.',
  unhealthy: 'Consider limiting outdoor exertion and keeping windows closed.',
  'very-unhealthy': 'Consider staying indoors and limiting outdoor exposure where possible.',
  hazardous: 'Consider avoiding outdoor exposure entirely.',
  unknown: '',
}

/**
 * Hero AQI-tint band — the 4 bands `surfaces.css .glass-card[data-aqi]`
 * defines (WfGlassCard's `aqi` prop). The live source classifies on 6 tiers
 * (`tierFromPm25`); `usg` folds into `unhealthy` and `very-unhealthy` folds
 * into `hazard` since only 4 tint values exist — no new tint is invented
 * here, the existing 4-band scale is reused as-is.
 */
export const TIER_TINT_BAND: Record<Exclude<AqiTier, 'unknown'>, WfGlassCardAqi> = {
  good: 'good',
  moderate: 'moderate',
  usg: 'unhealthy',
  unhealthy: 'unhealthy',
  'very-unhealthy': 'hazard',
  hazardous: 'hazard',
}

/**
 * Forecast cadence — same assumption as AqiCapsule's REFRESH_INTERVAL_MS
 * (components/fluid/capsule/AqiCapsule.tsx: the HF CAMS forecast refreshes
 * every 6h). A `generated_at` older than this reads as stale rather than
 * current — this is a display threshold local to the Home hero, not a claim
 * about the fetch pipeline's actual retry/refresh behavior.
 */
export const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000
