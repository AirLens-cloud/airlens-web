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
