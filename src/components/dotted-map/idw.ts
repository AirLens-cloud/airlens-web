/**
 * IDW (Inverse Distance Weighting) interpolation for PM2.5 dot coloring.
 * Assigns a PM2.5 value to each land dot based on nearby station data,
 * then maps it to an AQI color category.
 */

const DEG = Math.PI / 180;

// ── Types ──

export type { StationData } from '../../types/dotted-map'
import type { StationData } from '../../types/dotted-map'
import { vizAccentRgba } from '../../lib/config/viz'
import { GLOBE_CONFIG } from '../../lib/config/globe'
import { densityAlphaFactor } from '../globe/three/systems/idwCore'

// ── AQI Color Scale ──

/** AQI color categories — matches WHO PM2.5 thresholds (dark mode) */
const AQI_COLORS_DARK = [
  { max: 12, color: 'rgba(16, 185, 129, 0.70)' },      // Good — green
  { max: 35, color: 'rgba(250, 204, 21, 0.65)' },       // Moderate — yellow
  { max: 55, color: 'rgba(245, 158, 11, 0.70)' },       // USG — amber
  { max: 150, color: 'rgba(239, 68, 68, 0.75)' },       // Unhealthy — red
  { max: Infinity, color: 'rgba(139, 92, 246, 0.80)' }, // Hazardous — purple
] as const;

/** AQI color categories — light mode (lower alpha for readability) */
const AQI_COLORS_LIGHT = [
  { max: 12, color: 'rgba(16, 185, 129, 0.55)' },
  { max: 35, color: 'rgba(250, 204, 21, 0.50)' },
  { max: 55, color: 'rgba(245, 158, 11, 0.55)' },
  { max: 150, color: 'rgba(239, 68, 68, 0.60)' },
  { max: Infinity, color: 'rgba(139, 92, 246, 0.65)' },
] as const;

/** Number of distinct color groups for batched rendering */
export const COLOR_GROUP_COUNT = AQI_COLORS_DARK.length;

// ── Extrude Config ──

export const EXTRUDE_CONFIG = {
  /** Max height as fraction of globe radius */
  MAX_HEIGHT: 0.15,
  /** PM2.5 value that maps to max height */
  PM25_MAX: 200,
  /** Dot size multiplier for extruded dots */
  DOT_SCALE: 1.8,
  /** Spillover buffer distance in degrees */
  SPILLOVER_BUFFER_DEG: 15,
  /** Lerp speed for extrude animation (per frame) */
  ANIM_SPEED: 0.08,
  /** Max vertical lift in pixels for flat/2D mode */
  FLAT_LIFT_PX: 40,
  /** Extrude dot bright color (selected country) */
  EXTRUDE_COLOR: vizAccentRgba(0.7),
  /** Spillover dot color (dimmer) */
  SPILLOVER_COLOR: vizAccentRgba(0.35),
} as const;

/** Default dot color when no station data is available */
export const DEFAULT_DOT_COLOR = vizAccentRgba(0.25);

// ── IDW Config ──

/** IDW power parameter */
const IDW_POWER = 2;
/** Maximum distance in degrees — dots beyond this from all stations get default color */
const MAX_DISTANCE_DEG = 30;

// ── Observation-density decay (V-W4 delta 3) ──
// Ports idwCore's `densityAlphaFactor` semantics from the Globe 3D heatmap to
// this 2D dotted-map canvas: a dot's IDW-weighted mean distance to the
// stations that produced its color is a proxy for how much real observation
// it rests on, not how polluted it is. Params are the SAME GLOBE_CONFIG
// constants the Globe path uses — not re-tuned/re-declared here — so the two
// surfaces cannot silently drift apart (`.claude/rules/contributing.md`
// "하드코딩 금지 — 상수는 config 파일에").
const { DENSITY_FULL_DEG, DENSITY_FADE_DEG, DENSITY_ALPHA_MIN } = GLOBE_CONFIG.GLOBE_HEATMAP;
/** Quantization levels for the per-dot density-alpha factor — keeps the
 *  batched-fill renderer to (COLOR_GROUP_COUNT × ALPHA_BUCKETS) canvas draw
 *  calls instead of one draw per dot (thousands of land points). */
export const ALPHA_BUCKETS = 8;

/** Bucket index (0 = most faded/low-density, ALPHA_BUCKETS-1 = fully confident) → alpha multiplier. */
export function alphaBucketToFactor(bucket: number): number {
  const t = ALPHA_BUCKETS > 1 ? bucket / (ALPHA_BUCKETS - 1) : 1;
  return DENSITY_ALPHA_MIN + t * (1 - DENSITY_ALPHA_MIN);
}

/** Continuous density-alpha factor → nearest quantization bucket index. */
function densityFactorToBucket(factor: number): number {
  const t = (factor - DENSITY_ALPHA_MIN) / (1 - DENSITY_ALPHA_MIN);
  const clamped = Math.min(Math.max(t, 0), 1);
  return Math.round(clamped * (ALPHA_BUCKETS - 1));
}

// ── Functions ──

/** Approximate great-circle distance in degrees between two lat/lon points */
function distanceDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / DEG;
}

interface InterpolationResult {
  value: number;
  /** IDW-weighted mean distance (degrees) to the contributing stations — 0 for
   *  an exact station hit, bounded by construction to [0, MAX_DISTANCE_DEG]. */
  meanDistDeg: number;
}

/** Interpolate PM2.5 at a point using IDW from nearby stations */
function interpolatePM25(
  dotLat: number,
  dotLon: number,
  stations: StationData[],
): InterpolationResult | null {
  let weightSum = 0;
  let valueSum = 0;
  let distSum = 0;

  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    const d = distanceDeg(dotLat, dotLon, s.latitude, s.longitude);

    if (d > MAX_DISTANCE_DEG) continue;

    // Very close to station — return exact value, exact confidence (dist 0).
    if (d < 0.5) return { value: s.pm25, meanDistDeg: 0 };

    const w = 1 / Math.pow(d, IDW_POWER);
    weightSum += w;
    valueSum += w * s.pm25;
    distSum += w * d;
  }

  if (weightSum === 0) return null;
  return { value: valueSum / weightSum, meanDistDeg: distSum / weightSum };
}

/** Map PM2.5 value to color group index (0-4) */
function pm25ToGroupIndex(pm25: number): number {
  for (let i = 0; i < AQI_COLORS_DARK.length; i++) {
    if (pm25 <= AQI_COLORS_DARK[i].max) return i;
  }
  return AQI_COLORS_DARK.length - 1;
}

/** Get the CSS color string for a group index */
export function groupIndexToColor(index: number, isDark = true): string {
  const colors = isDark ? AQI_COLORS_DARK : AQI_COLORS_LIGHT;
  return colors[index]?.color ?? DEFAULT_DOT_COLOR;
}

export interface DotColorGroups {
  /** Group index (0-4) per land point, or 255 for dots outside station coverage. */
  colorGroups: Uint8Array;
  /**
   * Density-alpha bucket (0..ALPHA_BUCKETS-1) per land point — honesty signal
   * for how much real observation the dot's color rests on (V-W4 delta 3).
   * Meaningless (left 0) for 255/no-coverage dots — those already read as
   * "unknown" via DEFAULT_DOT_COLOR, not as a faded-but-known value.
   */
  alphaGroups: Uint8Array;
}

/**
 * Precompute color group + density-alpha bucket for each land point.
 *
 * @param landPoints - Array of [lng, lat] land coordinates
 * @param stations - PM2.5 station data
 */
export function precomputeDotColorGroups(
  landPoints: readonly (readonly [number, number])[],
  stations: StationData[],
): DotColorGroups {
  const colorGroups = new Uint8Array(landPoints.length);
  const alphaGroups = new Uint8Array(landPoints.length);

  if (stations.length === 0) {
    colorGroups.fill(255);
    return { colorGroups, alphaGroups };
  }

  for (let i = 0; i < landPoints.length; i++) {
    const [lng, lat] = landPoints[i];
    const result = interpolatePM25(lat, lng, stations);

    if (result === null) {
      colorGroups[i] = 255; // No coverage
    } else {
      colorGroups[i] = pm25ToGroupIndex(result.value);
      const factor = densityAlphaFactor(result.meanDistDeg, DENSITY_FULL_DEG, DENSITY_FADE_DEG, DENSITY_ALPHA_MIN);
      alphaGroups[i] = densityFactorToBucket(factor);
    }
  }

  return { colorGroups, alphaGroups };
}
