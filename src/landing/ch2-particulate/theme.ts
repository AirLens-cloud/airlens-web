/**
 * Ch2 (PARTICULATE) chapter-scoped theme — hex literals for the city-descent
 * flow-field visual concept only. Ported from AirLens-platform apps/landing-lab
 * `src/theme/config.ts` (the `PARTICULATE` and `SKY_RAMPS` consts) — same
 * rebinding seam Ch1's `theme.ts` established: that source file is the one
 * .ts the source repo exempts from its hardcoding hook, and the per-concept
 * palette is chapter-scene content (Wave L1-L5), landing here for Ch2.
 *
 * Unlike Ch1's `theme.ts`, this chapter needs no shared AQI/OBS_CYAN
 * re-export — FlowField/FallbackField/Readout/Overlay only ever reference
 * `PARTICULATE` and `SKY_RAMPS.dusk`, both self-contained here (verbatim
 * from the source, values unchanged).
 */

export const PARTICULATE = {
  bg: '#06070b',
  ink: '#e8ecf4',
  dim: '#9aa3b4',
  // Dusk warm tone (SKY_RAMPS.dusk tail) — not purple. Concept C palette = sky ramp.
  accent: '#f0b890',
  // Particle ramp: the colour a mote takes at the PM2.5 it is sitting in.
  // Cool pale (clean) → dusk warm → burnt (near the 150 µg/m³ cap).
  clean: '#8fb8d8',
  warm: '#f0b890',
  hot: '#e0603a',
  // Haze veil — what the sky ramp washes toward as the air thickens (visibility loss).
  veil: '#b8a08c',
  // The nav and the eyebrow sit over the *brightest* band of the dusk ramp, where the
  // dark-shell `dim` measures 2.43:1 against the rendered field. These are the lifted
  // greys that clear AA there (measured against the real pixels, not an assumed bg).
  navDim: '#cbd2de',
  dimStrong: '#c3c9d4',
} as const

// Sky gradient ramps (dawn → thunder), ported from apps/web reado.css --sky-grad-*.
// Only `dusk` is consumed by this chapter (FlowField/FallbackField composite the
// PARTICULATE scene against it); the rest of the ramp set is kept for parity with
// the source module rather than pruned to a single-entry object.
export const SKY_RAMPS = {
  dawn: ['#2a3a6a', '#7a5a8a', '#e0a0a0', '#f4d4b4'],
  morning: ['#4a7ab0', '#8ab4d8', '#c0dcef', '#eaf4fb'],
  noon: ['#4f93d4', '#74b0e2', '#a6d0ef', '#dcecfb'],
  dusk: ['#3a558a', '#6a5e98', '#c07e8e', '#f0b890'],
  night: ['#0c1430', '#1a2450', '#2a3868', '#3a4a80'],
  cloudy: ['#6b7a8f', '#8a98a8', '#aab4c0', '#cdd4dc'],
  fog: ['#8a9098', '#a6abb2', '#c2c6cc', '#dde0e4'],
  rain: ['#3f4d5e', '#566576', '#71808f', '#94a1ae'],
  snow: ['#9aa6b6', '#b8c2cf', '#d2dae3', '#eef1f5'],
  thunder: ['#23262e', '#363a47', '#4a4f60', '#5e6478'],
} as const
