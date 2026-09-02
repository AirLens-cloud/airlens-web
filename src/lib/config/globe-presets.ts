/**
 * Globe visual presets and standalone config objects — theme palettes,
 * dot matrix earth, ocean sphere, interaction, earth surface, HDRI,
 * starfield, HUD, satellite scan, and ocean SST.
 */

/**
 * Globe visual preset palettes — derived from Claude Design handoff globe-engine.jsx.
 * Each preset defines background, ocean, atmosphere, and graticule colors.
 */
import { VIZ_ACCENT_0X } from './viz';

export const GLOBE_THEME_PRESETS = {
  nullschool: {
    background: 0x000000,
    ocean: 0x05080d,
    land: 0x1a2430,
    graticule: 0xffffff,
    atmosphere: 0x0a1018,
    atmosphereOpacity: 0.15,
    graticuleOpacity: 0.12,
    haloColor: VIZ_ACCENT_0X,
    haloOpacity: 0.25,
  },
  windy: {
    background: 0x050a10,
    ocean: 0x0d2540,
    land: 0x16364d,
    graticule: 0x7dd3fc,
    atmosphere: 0x60a5fa,
    atmosphereOpacity: 1.0,
    graticuleOpacity: 0.3,
    haloColor: 0x60a5fa,
    haloOpacity: 0.6,
  },
  wireframe: {
    background: 0x000000,
    ocean: 0x000000,
    land: 0xffffff,
    graticule: 0xffffff,
    atmosphere: 0x000000,
    atmosphereOpacity: 0.0,
    graticuleOpacity: 0.42,
    haloColor: 0xffffff,
    haloOpacity: 0.1,
  },
} as const;

/** Dot Matrix Earth — yeo3d-style instanced dot globe */
export const DOT_MATRIX_CONFIG = {
  /** Land mask texture (inverted specular: land=255, ocean=0) */
  LAND_MASK_TEXTURE: '/textures/earth-land-mask.png',
  /** Globe radius for dot placement */
  GLOBE_R: 1.003,
  /** Point size in pixels (for THREE.Points) */
  POINT_SIZE: 2.0,
  /** Oversample multiplier — generate N× candidates, filter by land mask */
  OVERSAMPLE: 3.2,
  /** Land mask brightness threshold (0-255) — pixel above this = land */
  LAND_THRESHOLD: 30,
  /** Dot color */
  DOT_COLOR: '#f0f0f0',
  /** Bump/elevation texture — sampled for the land shader's altitude color ramp */
  BUMP_TEXTURE: '/textures/earth-bump.png',
  /** Reveal animation duration (seconds) */
  REVEAL_DURATION: 2.0,
  /** Per-tier point counts (after land filtering) */
  COUNTS: {
    high: 400_000,
    medium: 200_000,
    low: 80_000,
  },
} as const;

/** Ocean Sphere — animated shader ocean with wave displacement */
export const OCEAN_SPHERE_CONFIG = {
  /** Land mask texture (shared with dot matrix) */
  LAND_MASK_TEXTURE: '/textures/earth-land-mask.png',
  /** Deep ocean color */
  COLOR_DEEP: '#0f2240',
  /** Shallow/coastal ocean color */
  COLOR_SHALLOW: '#164060',
  /** Ocean surface opacity */
  OPACITY: 0.95,
  /** Wave FBM amplitude (vertex displacement) */
  WAVE_AMPLITUDE: 0.0018,
  /** Wave spatial scale */
  WAVE_SCALE: 8.0,
  /** Wave animation speed */
  WAVE_SPEED: 0.12,
  /** Specular highlight power */
  SPECULAR_POWER: 64.0,
  /** Specular intensity */
  SPECULAR_INTENSITY: 0.15,
  /** UV flow speed (slow drift) */
  FLOW_SPEED: 0.02,
  /** Land mask threshold */
  LAND_THRESHOLD: 30,
  /** Night-side city lights texture (NASA Black Marble 2016, public domain) — HD mode + mid/high tier only */
  NIGHT_TEXTURE: '/textures/earth-night-2k.jpg',
} as const;

/** Starfield twinkle shader configuration */
export const STARFIELD_CONFIG = {
  /** Star count (overrides per quality tier) */
  COUNT: 1800,
  /** Radial shell: inner/outer distance from origin */
  INNER_RADIUS: 35,
  OUTER_RADIUS: 47,
  /** Twinkle animation speed */
  TWINKLE_SPEED: 1.4,
  /** Twinkle amplitude (0 = steady, 0.45 = strong) */
  TWINKLE_AMPLITUDE: 0.45,
  /** Base brightness floor (so stars never fully disappear) */
  BRIGHTNESS_FLOOR: 0.55,
  /** Point size range */
  SIZE_MIN: 0.08,
  SIZE_MAX: 0.30,
} as const;
