/**
 * Adaptive Quality System — detects device capabilities and selects
 * a rendering quality tier (high / medium / low).
 *
 * Quality presets control geometry detail, instance limits, texture
 * resolution, and postprocessing toggles across all globe layers.
 */

import { MOBILE_GPU_MAX } from './breakpoints';

// ─── Types ──────────────────────────────────────────────────────────────────

export type QualityTier = 'high' | 'medium' | 'low';

export interface QualityPreset {
  tier: QualityTier;
  dpr: [number, number];
  earthSegments: number;
  cloudSegments: number;
  heatmapResolution: [number, number];
  maxMarkers: number;
  maxSpikes: number;
  maxHalos: number;
  maxDots: number;
  arcSegments: number;
  bloomEnabled: boolean;
  /** Liquid Glass interactive mode enabled */
  liquidGlassInteractive: boolean;
  /** Spatial UI 3D depth effects enabled */
  spatialUIEnabled: boolean;
  /** DQSS blur post-processing enabled */
  dqssBlurEnabled: boolean;
  /** WebGL antialias (disabled on lower tiers for performance) */
  antialias: boolean;
  /** Tube arc radial segments (fewer = faster) */
  tubeArcRadialSegments: number;
  /** Outer halo layer enabled */
  haloEnabled: boolean;
  /** Wind field particle count (nullschool-style) */
  maxWindParticles: number;
  /** Use WebGL wind field (false = Canvas 2D fallback) */
  webglWindField: boolean;
  /** Point cloud earth vertex count */
  maxPointCloudPoints: number;
  /** Dot matrix earth instance count (yeo3d-style) */
  maxDotMatrixPoints: number;
}

// ─── Presets ────────────────────────────────────────────────────────────────

export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = {
  high: {
    tier: 'high',
    dpr: [1, 1.5],
    earthSegments: 128,
    cloudSegments: 96,
    heatmapResolution: [2048, 1024],
    maxMarkers: 1500,
    maxSpikes: 600,
    maxHalos: 150,
    maxDots: 14000,
    arcSegments: 64,
    bloomEnabled: true,
    liquidGlassInteractive: true,
    spatialUIEnabled: true,
    dqssBlurEnabled: true,
    antialias: true,
    tubeArcRadialSegments: 4,
    haloEnabled: true,
    maxWindParticles: 8000,
    webglWindField: true,
    maxPointCloudPoints: 75_000,
    maxDotMatrixPoints: 400_000,
  },
  medium: {
    tier: 'medium',
    dpr: [1, 1.5],
    earthSegments: 64,
    cloudSegments: 48,
    heatmapResolution: [1024, 512],
    maxMarkers: 750,
    maxSpikes: 300,
    maxHalos: 50,
    maxDots: 7000,
    arcSegments: 32,
    bloomEnabled: true,
    liquidGlassInteractive: true,
    spatialUIEnabled: true,
    dqssBlurEnabled: false,
    antialias: false,
    tubeArcRadialSegments: 3,
    haloEnabled: true,
    maxWindParticles: 4000,
    webglWindField: true,
    maxPointCloudPoints: 40_000,
    maxDotMatrixPoints: 200_000,
  },
  low: {
    tier: 'low',
    dpr: [1, 1],
    earthSegments: 32,
    cloudSegments: 24,
    heatmapResolution: [512, 256],
    maxMarkers: 300,
    maxSpikes: 100,
    maxHalos: 0,
    maxDots: 3000,
    arcSegments: 16,
    bloomEnabled: false,
    liquidGlassInteractive: false,
    spatialUIEnabled: false,
    dqssBlurEnabled: false,
    antialias: false,
    tubeArcRadialSegments: 2,
    haloEnabled: false,
    maxWindParticles: 1500,
    webglWindField: false,
    maxPointCloudPoints: 20_000,
    maxDotMatrixPoints: 80_000,
  },
};

// ─── Device Detection ───────────────────────────────────────────────────────

/**
 * Detect device capability tier based on hardware signals.
 * Runs once at app startup — result stored in globeStore.
 */
export function detectQualityTier(): QualityTier {
  // Server-side or test environment
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return 'medium';
  }

  let score = 0;

  // CPU cores (4+ = modern device)
  const cores = navigator.hardwareConcurrency ?? 2;
  if (cores >= 8) score += 3;
  else if (cores >= 4) score += 2;
  else score += 0;

  // Device memory (Chrome/Edge only)
  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  if (mem != null) {
    if (mem >= 8) score += 3;
    else if (mem >= 4) score += 2;
    else score += 0;
  } else {
    // Unknown — assume medium
    score += 1;
  }

  // Screen resolution + DPR
  const dpr = window.devicePixelRatio ?? 1;
  const pixels = window.screen.width * window.screen.height * dpr;
  if (pixels > 4_000_000) score += 2; // 4K+ effective
  else if (pixels > 2_000_000) score += 1;

  // Mobile detection (touch + small screen = likely lower GPU)
  const isMobile = 'ontouchstart' in window && window.screen.width < MOBILE_GPU_MAX;
  if (isMobile) score -= 2;

  // Classify
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

/**
 * Get the quality preset for a given tier.
 */
export function getQualityPreset(tier: QualityTier): QualityPreset {
  return QUALITY_PRESETS[tier];
}

// ─── FPS Monitor ───────────────────────────────────────────────────────────

const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high'];

/**
 * FPS-based dynamic quality controller.
 * Call `tick()` every frame from the R3F render loop.
 * When sustained FPS drops below `downgradeThreshold` or exceeds
 * `upgradeThreshold`, it calls `onTierChange` with the new tier.
 *
 * Hysteresis: requires `windowSize` consecutive frames before acting,
 * with a cooldown to prevent oscillation.
 */
export function createFPSMonitor(options: {
  initialTier: QualityTier;
  onTierChange: (tier: QualityTier) => void;
  downgradeThreshold?: number;
  upgradeThreshold?: number;
  windowSize?: number;
  cooldownMs?: number;
}) {
  const {
    onTierChange,
    downgradeThreshold = 25,
    upgradeThreshold = 50,
    windowSize = 60,
    cooldownMs = 10_000,
  } = options;

  let currentTier = options.initialTier;
  const frameTimes: number[] = [];
  let lastChangeTime = 0;
  let lastTime = 0;

  function tick(now: number) {
    if (lastTime > 0) {
      const delta = now - lastTime;
      if (delta > 0) {
        frameTimes.push(delta);
        if (frameTimes.length > windowSize) frameTimes.shift();
      }
    }
    lastTime = now;

    // Need enough samples before making decisions
    if (frameTimes.length < windowSize) return;

    // Cooldown check
    if (now - lastChangeTime < cooldownMs) return;

    const avgDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const avgFPS = 1000 / avgDelta;
    const tierIdx = TIER_ORDER.indexOf(currentTier);

    if (avgFPS < downgradeThreshold && tierIdx > 0) {
      // Downgrade
      currentTier = TIER_ORDER[tierIdx - 1];
      lastChangeTime = now;
      frameTimes.length = 0;
      onTierChange(currentTier);
    } else if (avgFPS > upgradeThreshold && tierIdx < TIER_ORDER.length - 1) {
      // Upgrade
      currentTier = TIER_ORDER[tierIdx + 1];
      lastChangeTime = now;
      frameTimes.length = 0;
      onTierChange(currentTier);
    }
  }

  return { tick };
}
