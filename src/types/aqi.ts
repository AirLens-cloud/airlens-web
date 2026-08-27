/**
 * AQI tier types — ported subset from AirLens-platform apps/web
 * `src/types/air-quality.ts` (G1 engine landing). `lib/config/aqi.ts` is the
 * only consumer in this repo so far.
 */

/** Four-tier simplified AQI band. */
export type AqiSimpleTier = 'good' | 'mod' | 'usg' | 'haz'

export interface ForecastTierInfo {
  label: string
  color: string
  /** WCAG AA text-safe variant of `color` for text on paper surfaces (--aqi-*-ink). */
  textColor: string
}
