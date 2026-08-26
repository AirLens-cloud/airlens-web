/**
 * Landing shared theme constants — rebinding seam, not a token source.
 *
 * The source repo's `apps/landing-lab/src/theme/config.ts` is the one .ts file
 * exempted from the check-hardcoding hook and holds every hex literal for all
 * five landing-lab concepts (ATMOS/FIELD/PARTICULATE/SEOUL/BRIEFING/etc.),
 * because it also imports `AQI_GRADE_HEX` from `@airlens/design-tokens`.
 *
 * That whole per-concept palette is Wave L1-L5 content (chapter scenes) and is
 * explicitly out of scope for Wave L0 (flight shell only). The one shared,
 * cross-chapter piece — the AQI hex scale — is ported here, but rebound to
 * this repo's already-ported token module instead of a new hardcoded array:
 * `src/lib/atmosphericBackgroundConfig.ts` (`K4_PALETTE`/`OBS_CYAN_HEX`),
 * which itself mirrors the `--aqi-*`/`--obs-cyan` custom properties in
 * `src/styles/tokens.css`/`obs.css`. No new hex literals are introduced here —
 * when a later wave needs the fuller 6-tier `--aqi-*` scale (vunh/haz), read
 * those two additional stops from `tokens.css` via `getComputedStyle`, or
 * extend `K4_PALETTE`'s source of truth — never hardcode a parallel array.
 *
 * Wave L1 update: `AQI_GRADE_HEX` (MODERATE/UNHEALTHY/HAZARDOUS) is now also
 * re-exported from here — the ch1-atmos scene needed the same named-key shape
 * the source repo's `@airlens/design-tokens` package exposed. It is added to
 * `atmosphericBackgroundConfig.ts` (extending the existing SOT — HAZARDOUS
 * mirrors `--aqi-haz`), not introduced as a new parallel array.
 */
export { K4_PALETTE, OBS_CYAN_HEX, AQI_GRADE_HEX } from '../../../lib/atmosphericBackgroundConfig'
