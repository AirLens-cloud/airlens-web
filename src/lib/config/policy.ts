/**
 * SDID ATT magnitude (µg/m³) beyond which an estimate is treated as a
 * synthetic-control divergence rather than a credible causal effect
 * (Glass-box). National annual PM2.5 policy effects rarely exceed this; values
 * above it are flagged "unstable" so they are not read as confirmed effects.
 *
 * Ported from AirLens-platform `apps/web/src/lib/config/policy.ts`.
 */
export const ATT_PLAUSIBLE_MAX = 30;

/** Panel-fit score cutoffs → grade. Not the sensor DQSS scale (different quantity). */
export const POLICY_FIT_GRADE_CUTOFFS: readonly (readonly [number, 'A' | 'B' | 'C' | 'D'])[] = [
  [80, 'A'],
  [60, 'B'],
  [40, 'C'],
  [20, 'D'],
];
