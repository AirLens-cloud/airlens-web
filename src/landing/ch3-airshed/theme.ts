/**
 * Ch3 (AIRSHED) chapter-scoped theme — hex literals for the Seoul-district
 * extrusion visual concept only. Ported from AirLens-platform apps/landing-lab
 * `src/theme/config.ts` (the `SEOUL` const) — same rebinding seam Ch1's and
 * Ch2's `theme.ts` established: that source file is the one .ts the source
 * repo exempts from its hardcoding hook, and the per-concept palette is
 * chapter-scene content (Wave L1-L5), landing here for Ch3.
 *
 * Unlike Ch1's `theme.ts`, this chapter needs no shared AQI/OBS_CYAN
 * re-export — Districts/Buildings/Haze/WindStreaks/Hud/Sections only ever
 * reference `SEOUL`, self-contained here (verbatim from the source, values
 * unchanged). The source's `BRIEFING` const (a different concept's palette)
 * is not carried over — nothing in this chapter reads it.
 */

export const SEOUL = {
  bg: '#0b1026',
  bgLift: '#141c3d',
  panel: '#101736',
  hair: '#2a3452',
  ink: '#e9edf6', // 16.04:1
  dim: '#96a3bd', // 7.41:1
  accent: '#f0a860', // 9.38:1
  pmClean: '#8fd0e8', // 11.07:1
  pmWarm: '#f0a860',
  pmHot: '#ff7a52', // 7.31:1
} as const
