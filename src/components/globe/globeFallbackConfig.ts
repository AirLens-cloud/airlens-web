/**
 * Config for GlobeFallback's static SVG gradient + marker dots.
 * Ported from AirLens-platform apps/web/src/lib/config/globe-v2.ts
 * (`GLOBE_COLORS.FALLBACK_GRADIENT`) plus the static representative-city
 * marker dots and rim/graticule colors — extracted to its own config module
 * (rather than left inline in the component) per the "constants live in
 * config, not inline" convention.
 */
export const FALLBACK_GRADIENT: readonly [string, string, string] = ['#1a2f4a', '#0f1f38', '#050b18']

export interface GlobeFallbackMarker {
  cx: number
  cy: number
  r: number
  hex: string
  opacity: number
  label: string
}

export const FALLBACK_MARKERS: readonly GlobeFallbackMarker[] = [
  { cx: 340, cy: 200, r: 3, hex: '#4ade80', opacity: 0.8, label: 'Seoul' },
  { cx: 350, cy: 215, r: 2.5, hex: '#fbbf24', opacity: 0.7, label: 'Tokyo' },
  { cx: 310, cy: 210, r: 3.5, hex: '#ef4444', opacity: 0.8, label: 'Beijing' },
  { cx: 230, cy: 230, r: 2.5, hex: '#4ade80', opacity: 0.7, label: 'London' },
  { cx: 170, cy: 215, r: 3, hex: '#4ade80', opacity: 0.7, label: 'NYC' },
  { cx: 290, cy: 250, r: 3, hex: '#fbbf24', opacity: 0.7, label: 'Delhi' },
]

const alpha = (rgb: string, a: number): string => `rgba(${rgb},${a})`

/** obs-cyan rim glow — matches --obs-cyan (37,226,244), scoped to this SVG only. */
export const FALLBACK_RIM_EDGE_HEX = alpha('37,226,244', 0)
export const FALLBACK_RIM_OUTER_HEX = alpha('37,226,244', 0.35)
export const FALLBACK_GLOBE_STROKE_HEX = alpha('37,226,244', 0.25)
export const FALLBACK_GRATICULE_LIGHT_HEX = alpha('140,160,180', 0.18)
export const FALLBACK_GRATICULE_MID_HEX = alpha('140,160,180', 0.14)
export const FALLBACK_GRATICULE_FAINT_HEX = alpha('140,160,180', 0.1)
