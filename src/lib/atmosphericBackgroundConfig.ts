/**
 * Config for AtmosphericBackground's canvas particle colors.
 * Ported from AirLens-platform apps/web/src/lib/earth/config.ts (`PM25_COLOR_SCALE`)
 * and apps/web/src/components/home/observatory/engine/config.ts (`OBS_COLOR.cyan`),
 * simplified per the porting brief (decision, K4 4-color palette rather than the
 * full PM2.5 gradient scale): the first 4 tiers of the K4 6-tier AQI palette
 * (good / moderate / usg / unhealthy) — the same 4 hex values used by AqiDot.
 */
export const K4_PALETTE: readonly string[] = ['#4F7A4F', '#B58A2E', '#B86B2E', '#9F3A2E']

/** obs-cyan — matches --obs-cyan, used only for the void-surface condensation trail. */
export const OBS_CYAN_HEX = '#25e2f4'

/**
 * Named subset of the AQI hex scale, keyed the way `@airlens/design-tokens`'
 * `AQI_GRADE_HEX` was keyed in the source repo (Wave L1, ch1-atmos port).
 * MODERATE/UNHEALTHY reuse K4_PALETTE's existing stops (indices 1 and 3) rather
 * than repeat their literals; HAZARDOUS is not part of K4_PALETTE's 4-tier
 * subset, so it is added here instead of a new parallel array — value mirrors
 * `--aqi-haz` in src/styles/tokens.css.
 */
export const AQI_GRADE_HEX = {
  MODERATE: K4_PALETTE[1],
  UNHEALTHY: K4_PALETTE[3],
  HAZARDOUS: '#4a1f4a',
} as const
