/**
 * Earth Engine Configuration — constants from cambecc/earth
 */

// ─── Timing ─────────────────────────────────────────────────────────────────

/** Amount of time before a task yields control (ms) */
export const MAX_TASK_TIME = 100;

/** Amount of time a task waits before resuming (ms) */
export const MIN_SLEEP_TIME = 25;

/** Time to wait for a move operation to be considered done (ms) */
export const MOVE_END_WAIT = 1000;

/** Target milliseconds per animation frame */
export const FRAME_RATE = 40;

// ─── Input ──────────────────────────────────────────────────────────────────

/** Slack before a drag operation begins (pixels) */
export const MIN_MOVE = 4;

// ─── Rendering ──────────────────────────────────────────────────────────────

/** Overlay transparency (on scale [0, 255]) */
export const OVERLAY_ALPHA = Math.floor(0.4 * 255);

/** Step size of particle intensity color scale */
export const INTENSITY_SCALE_STEP = 10;

/** Max number of frames a particle is drawn before regeneration */
export const MAX_PARTICLE_AGE = 100;

/** Line width of a drawn particle */
export const PARTICLE_LINE_WIDTH = 1.0;

/** Particle count scalar (particles per screen width) */
export const PARTICLE_MULTIPLIER = 7;

/** Reduce particle count for mobile devices */
export const PARTICLE_REDUCTION = 0.75;

// ─── Globe ──────────────────────────────────────────────────────────────────

/** Default scale extent for zoom */
export const SCALE_EXTENT: [number, number] = [25, 3000];

/** Default auto-rotate speed (degrees per frame) */
export const AUTO_ROTATE_SPEED = 0.08;

/** Drag sensitivity scaling base */
export const DRAG_SENSITIVITY_BASE = 60;

// ─── Data ───────────────────────────────────────────────────────────────────

/** Path to earth topology file */
export const TOPOLOGY_PATH = '/data/earth-topo.json';

/** Path to mobile (lower resolution) topology */
export const TOPOLOGY_MOBILE_PATH = '/data/earth-topo-mobile.json';

// ─── Wind Overlay Normalization (legacy — unused elsewhere, kept as-is) ─────

/** Max wind speed for overlay normalization (m/s). */
export const MAX_WIND_OVERLAY = 17;

// ─── PM2.5 & Wind Speed Color Scales (single source of truth) ────────────

import type { ColorSegments, ModeOption, LayerOption } from '../../types/globe';
import { oklabLerp } from './color';

/** PM2.5 µg/m³ → RGB mapping (WHO / IQAir standard). */
export const PM25_COLOR_SCALE: ColorSegments = [
  [0, [16, 185, 129]],      // Good — green
  [12, [16, 185, 129]],
  [35, [37, 226, 244]],     // Moderate — cyan
  [55, [245, 158, 11]],     // USG — amber
  [150, [239, 68, 68]],     // Unhealthy — red
  [250, [139, 92, 246]],    // Very unhealthy — purple
  [500, [153, 27, 27]],     // Hazardous — dark red
];

/**
 * PM10 µg/m³ → RGB mapping — same ramp as PM2.5, band edges from the US EPA
 * 24h PM10 breakpoints (54/154/254/354/424). PM10 concentrations run ~2-4×
 * PM2.5 for the same air quality category, so reusing the PM2.5 stops would
 * paint moderate PM10 air as hazardous.
 */
export const PM10_COLOR_SCALE: ColorSegments = [
  [0, [16, 185, 129]],      // Good — green
  [54, [16, 185, 129]],
  [154, [37, 226, 244]],    // Moderate — cyan
  [254, [245, 158, 11]],    // USG — amber
  [354, [239, 68, 68]],     // Unhealthy — red
  [424, [139, 92, 246]],    // Very unhealthy — purple
  [604, [153, 27, 27]],     // Hazardous — dark red
];

/**
 * Breathline wind ramp (m/s) — renderer and legend SOT. The former 0/75/250
 * stops compressed the surface field (p50 5.6, p90 11.2, max 23.1) into the
 * first few percent of cyan. These thresholds keep real flow separable.
 * Previously this legend used an unrelated 12-stop sinebow scale
 * (NULLSCHOOL_WIND_SEGMENTS) that had no connection to the particles actually
 * rendered — replaced here so shader and legend can't drift apart again.
 */
export const WIND_SPEED_RAMP: ColorSegments = [
  [0, [86, 111, 127]],    // mist slate — calm
  [5, [66, 194, 203]],    // cyan — breeze
  [10, [61, 226, 198]],   // mint — brisk
  [20, [208, 231, 112]],  // chartreuse — strong
  [30, [255, 177, 78]],   // amber — near gale
  [40, [255, 91, 112]],   // coral — gale+
];

/** Shared saturation point for shader normalization and the physical legend. */
export const WIND_SPEED_MAX_MPS = WIND_SPEED_RAMP.at(-1)?.[0] ?? 40;

// ─── IDW Interpolation Config ─────────────────────────────────────────────

export const IDW_CONFIG = {
  /** Station data (cached) — wide radius for sparse network */
  station: { power: 2.0, maxDistanceDeg: 15 },
  /** Gridded policy data — tight radius for precise regions */
  policyGrid: { power: 2.0, maxDistanceDeg: 5 },
  /** Policy map renderer — balanced coverage */
  policyMap: { power: 2.0, maxDistanceDeg: 12 },
} as const;

// ─── Globe UI Metadata ────────────────────────────────────────────────────

import type { DataMode, PressureLevel, ProjectionType } from '../../types/globe';

export const DATA_MODE_OPTIONS: readonly ModeOption[] = [
  { mode: 'air', label: 'Air', defaultOverlay: 'wind' },
  { mode: 'ocean', label: 'Ocean', defaultOverlay: 'currents' },
  { mode: 'chemistry', label: 'Chem', defaultOverlay: 'no2' },
  { mode: 'particulates', label: 'PM', defaultOverlay: 'pm25' },
  { mode: 'biology', label: 'Pollen', defaultOverlay: 'pollen_grass' },
  { mode: 'policy', label: 'Policy', defaultOverlay: 'none' },
];


export const LAYER_OPTIONS: Partial<Record<DataMode, readonly LayerOption[]>> = {
  air: [
    { key: 'wind', label: 'Wind', unit: 'm/s' },
    { key: 'temp', label: 'Temp', unit: '°C' },
    { key: 'rh', label: 'RH', unit: '%' },
  ],
  ocean: [
    { key: 'currents', label: 'Currents', unit: 'm/s' },
    { key: 'sst', label: 'SST', unit: '°C' },
    { key: 'ssta', label: 'Anomaly', unit: '°C' },
    { key: 'waves', label: 'Waves', unit: 'm' },
  ],
  chemistry: [
    { key: 'no2', label: 'NO\u2082', unit: 'ppb' },
    { key: 'o3', label: 'O\u2083', unit: 'ppb' },
    { key: 'co', label: 'CO', unit: 'ppm' },
  ],
  particulates: [
    { key: 'pm25', label: 'PM2.5', unit: '\u00b5g/m\u00b3' },
    { key: 'pm10', label: 'PM10', unit: '\u00b5g/m\u00b3' },
  ],
  biology: [
    { key: 'pollen_grass', label: 'Grass', unit: 'grains/m\u00b3' },
    { key: 'pollen_birch', label: 'Birch', unit: 'grains/m\u00b3' },
    { key: 'pollen_alder', label: 'Alder', unit: 'grains/m\u00b3' },
    { key: 'pollen_mugwort', label: 'Mugwort', unit: 'grains/m\u00b3' },
    { key: 'pollen_olive', label: 'Olive', unit: 'grains/m\u00b3' },
    { key: 'pollen_ragweed', label: 'Ragweed', unit: 'grains/m\u00b3' },
  ],
  policy: [],
};

export interface AltitudeOption {
  readonly key: PressureLevel;
  readonly label: string;
}

export const PRESSURE_LEVEL_OPTIONS: readonly AltitudeOption[] = [
  { key: 'surface', label: 'Sfc' },
  { key: '1000hPa', label: '1000' },
  { key: '850hPa', label: '850' },
  { key: '700hPa', label: '700' },
  { key: '500hPa', label: '500' },
  { key: '250hPa', label: '250' },
  { key: '70hPa', label: '70' },
  { key: '10hPa', label: '10' },
];

// 바람 고도 옵션(WIND_LEVEL_OPTIONS)과 신선도 SLA(WIND_FRESHNESS_SLA_H)는 P2 에서
// lib/config/globeOntology.ts (wind.verticalLevels / pipeline.freshnessSlaH) 로 이관됐다.
// 소비자는 lib/config/globeOverlays.ts 및 globeOntology.ts 에서 읽는다.

// ─── Projection Options ──────────────────────────────────────────────────

export interface ProjectionOption {
  readonly key: ProjectionType;
  readonly label: string;
  readonly shortcut: string;
}

export const PROJECTION_OPTIONS: readonly ProjectionOption[] = [
  { key: 'orthographic', label: 'O', shortcut: 'o' },
  { key: 'equirectangular', label: 'E', shortcut: 'e' },
  { key: 'stereographic', label: 'S', shortcut: 's' },
  { key: 'conicEquidistant', label: 'CE', shortcut: 'c' },
  { key: 'patterson', label: 'P', shortcut: 'p' },
  { key: 'winkelTripel', label: 'W3', shortcut: 'w' },
  { key: 'atlantis', label: 'At', shortcut: 'a' },
  { key: 'waterman', label: 'Wt', shortcut: 'b' },
];

// ─── Color Bar Config ─────────────────────────────────────────────────────

export interface ColorBarConfig {
  readonly gradient: string;
  readonly ticks: readonly string[];
  readonly unit: string;
}

/** Sub-stops sampled per band (segment-to-segment span) when building the CSS gradient. */
const GRADIENT_SUB_STOPS = 8;

/**
 * Exported for reuse by lib/config/globeOverlays.ts (POLICY_CHOROPLETH_GRADIENT) — same
 * segments-to-CSS-gradient conversion, single source of truth for the legend renderer.
 *
 * Threshold (tick) colors are authored WHO/IQAir grade boundaries and stay byte-exact —
 * only the *interior* of each band is resampled through OKLab (color.ts) so a
 * green→cyan transition doesn't visually dip through a muddy sRGB-lerp grey. Bands keep
 * the same equal-width layout the plain stop list produced before (browser auto-spacing),
 * now made explicit via `%` positions so inserting sub-stops doesn't skew existing ticks.
 */
export function segmentsToGradient(segs: ColorSegments): string {
  const bandCount = segs.length - 1;
  if (bandCount <= 0) {
    const [, c] = segs[0];
    return `linear-gradient(90deg, rgb(${c[0]},${c[1]},${c[2]}), rgb(${c[0]},${c[1]},${c[2]}))`;
  }

  const stops: string[] = [];
  for (let band = 0; band < bandCount; band++) {
    const [, cLo] = segs[band];
    const [, cHi] = segs[band + 1];
    const bandStartPct = (band / bandCount) * 100;
    const bandEndPct = ((band + 1) / bandCount) * 100;
    // band>0 skips its first sub-stop — it's the same position+color as the previous
    // band's last sub-stop (the shared tick boundary), no need to emit it twice.
    const firstSub = band === 0 ? 0 : 1;
    for (let i = firstSub; i < GRADIENT_SUB_STOPS; i++) {
      const t = i / (GRADIENT_SUB_STOPS - 1);
      const pct = bandStartPct + t * (bandEndPct - bandStartPct);
      let r: number, g: number, b: number;
      if (i === 0) [r, g, b] = cLo;
      else if (i === GRADIENT_SUB_STOPS - 1) [r, g, b] = cHi;
      else [r, g, b] = oklabLerp(cLo, cHi, t);
      stops.push(`rgb(${r},${g},${b}) ${pct.toFixed(2)}%`);
    }
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

// Deep-blue low ends carry an OKLab-lightness floor (L≥0.45) so they stay legible
// where the overlay composites over the dark night-side earth (below the floor they
// read as black). Hue/chroma are preserved; only lightness is lifted. This is baked
// into the authored stop so legend and globe render share one SOT. The WHO PM2.5/PM10
// health scale is intentionally left untouched (its categories are already ≥floor).
export const TEMP_COLOR_SCALE: ColorSegments = [
  [-40, [43, 59, 205]], [-20, [60, 120, 200]], [0, [100, 200, 200]],
  [10, [200, 230, 100]], [20, [240, 180, 40]], [30, [220, 60, 30]], [40, [160, 20, 20]],
];

export const RH_COLOR_SCALE: ColorSegments = [
  [0, [180, 120, 60]], [25, [200, 180, 100]], [50, [100, 180, 140]],
  [75, [40, 120, 180]], [100, [33, 76, 177]],
];

// ─── Additional Scalar Field Color Scales ────────────────────────────────

/** NO₂ ppb — Open-Meteo range typically 0–60+ ppb, spikes to ~100 ppb urban */
export const NO2_COLOR_SCALE: ColorSegments = [
  [0, [40, 180, 120]], [5, [100, 200, 80]], [15, [180, 210, 60]],
  [30, [220, 200, 50]], [50, [240, 140, 30]], [80, [220, 50, 30]],
  [120, [160, 20, 20]],
];

/** O₃ ppb — Open-Meteo range typically 5–200 ppb */
export const O3_COLOR_SCALE: ColorSegments = [
  [0, [60, 80, 180]], [30, [80, 160, 200]], [60, [120, 200, 160]],
  [90, [200, 200, 60]], [120, [240, 140, 30]], [200, [200, 40, 40]],
];

/** CO µg/m³ — Open-Meteo returns µg/m³ (not ppm), range typically 40–500+ µg/m³ */
export const CO_COLOR_SCALE: ColorSegments = [
  [0, [60, 140, 180]], [50, [80, 180, 140]], [100, [160, 200, 80]],
  [200, [220, 200, 50]], [350, [240, 140, 30]], [500, [200, 60, 40]],
];

// Deep-blue low end floored to OKLab L≥0.45 for night-side legibility (see TEMP note).
export const SST_COLOR_SCALE: ColorSegments = [
  [0, [40, 76, 173]], [8, [30, 140, 200]], [16, [100, 200, 180]],
  [24, [255, 210, 90]], [32, [230, 60, 50]],
];

export const SSTA_COLOR_SCALE: ColorSegments = [
  [-3, [36, 69, 189]], [-1, [80, 140, 210]], [0, [220, 220, 220]],
  [1, [210, 120, 80]], [3, [200, 40, 40]],
];

/** Wave height (m) — Open-Meteo marine, range typically 0–10 m */
export const WAVES_COLOR_SCALE: ColorSegments = [
  [0, [40, 80, 160]], [1, [60, 140, 200]], [2, [80, 200, 180]],
  [4, [200, 220, 80]], [6, [240, 140, 40]], [10, [200, 40, 40]],
];

/** Ocean current velocity (m/s) — Open-Meteo marine, range typically 0–8 m/s.
 *  Low end floored to OKLab L≥0.45 for night-side legibility (see TEMP note). */
export const CURRENTS_COLOR_SCALE: ColorSegments = [
  [0, [46, 89, 125]], [0.3, [20, 140, 180]], [0.8, [34, 193, 212]],
  [1.5, [100, 220, 240]], [3.0, [200, 220, 120]], [5.0, [240, 160, 60]],
  [8.0, [220, 60, 40]],
];

/** Pollen grains/m³ — Open-Meteo AQ (Europe, CAMS-based, 11 km resolution) */
export const POLLEN_COLOR_SCALE: ColorSegments = [
  [0, [40, 160, 60]], [30, [180, 210, 50]], [100, [240, 140, 30]],
  [300, [210, 40, 40]],
];

/**
 * Globe P5b policy choropleth — ratio of a country's PM2.5/annual standard to
 * the WHO guideline (1× = meets WHO, higher = looser). Shared by
 * CountryChoropleth.tsx (paint) and GlobeLegend.tsx (gradient bar), via
 * lib/config/globeOverlays.ts. Distinct palette from cyan (#25e2f4, globe chrome).
 */
export const POLICY_CHOROPLETH_SCALE: ColorSegments = [
  [1, [42, 157, 143]], [2, [233, 196, 106]], [4, [244, 162, 97]],
  [6, [231, 111, 81]], [8, [156, 60, 80]],
];

/** Countries with no PM2.5/annual standard on file — neutral slate. */
export const POLICY_CHOROPLETH_NEUTRAL: readonly [number, number, number] = [70, 80, 95];

// COLOR_BAR_CONFIGS / OVERLAY_DISPLAY_LABELS 는 P2 에서 lib/config/globeOntology.ts 로
// 이관됐다 (현상별 legend/hud). 소비자는 lib/config/globeOverlays.ts 의 파생 맵을 읽는다.
// 본 파일은 색 스케일 배열(hex SSOT)과 segmentsToGradient 만 소유한다.

// ─── DQSS Badge Thresholds ─────────────────────────────────────────────────

export const DQSS_BADGE_THRESHOLDS = {
  GOOD: 80,
  MODERATE: 50,
} as const;

// ─── Canvas Rendering Constants ─────────────────────────────────────────────

export const CANVAS_CONSTANTS = {
  MARKER_CORE_ALPHA_MIN: 0.4,
  MARKER_CORE_ALPHA_RANGE: 0.5,
  MARKER_BADGE_ALPHA: 0.9,
  MARKER_BADGE_RADIUS: 2.5,
  CLUSTER_DISTANCE_THRESHOLD: 80,
} as const;

export const PM25_UNCERTAINTY_FACTORS = {
  P10: 0.9,
  P90: 1.1,
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

export function isMobile(): boolean {
  return /android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(
    navigator.userAgent,
  );
}
