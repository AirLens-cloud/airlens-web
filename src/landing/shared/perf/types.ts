// Render-quality types for the 3D / shader concepts (see QualityProvider).
// Ported verbatim from AirLens-platform apps/landing-lab `src/shared/perf/types.ts`.
export type QualityTier = 'high' | 'medium' | 'low'

export interface QualityValue {
  tier: QualityTier
  /** true until the rAF probe finishes; scenes may start at a safe default. */
  measuring: boolean
}

export interface DeviceLike {
  deviceMemory?: number
}
