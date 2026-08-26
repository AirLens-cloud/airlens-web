/**
 * Ch1 (ATMOS) chapter-scoped theme — hex literals for the globe/space visual
 * concept only. Ported from AirLens-platform apps/landing-lab `src/theme/config.ts`
 * (the `ATMOS` and `EARTH` consts) — that file is the one .ts the source repo
 * exempts from its hardcoding hook, and its own doc comment says the
 * per-concept palette is deliberately out of scope for Wave L0 and lands with
 * each chapter's scene (Wave L1-L5). This file is that landing point for Ch1.
 *
 * `accent` reuses `OBS_CYAN_HEX` from the shared theme module instead of
 * repeating the `#25e2f4` literal — same hue, one definition. The AQI-scale
 * colors this scene also needs (MODERATE/UNHEALTHY/HAZARDOUS) come from
 * `../shared/theme/config` (`AQI_GRADE_HEX`), not from here.
 */
import { OBS_CYAN_HEX } from '../shared/theme/config'

export const ATMOS = {
  bg: '#05070d',
  ink: '#e8ecf4',
  dim: '#8a94a8',
  accent: OBS_CYAN_HEX,
  hud: '#5a6a85',
} as const

// Globe point-cloud colors (deep ocean → light land).
export const EARTH = {
  ocean: '#2c3c56',
  land: '#b6c2d8',
} as const
