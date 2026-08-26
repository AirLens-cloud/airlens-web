/**
 * Globe V2 configuration — Three.js/R3F renderer settings including camera,
 * point cloud, voxel atmosphere, light beams, lights, wind, and particles.
 */
import { VIZ_ACCENT_0X } from './viz';
import { WIND_SPEED_MAX_MPS } from '../earth/config';

export const GLOBE_V2_CONFIG = {
  BACKGROUND_COLOR: '#0a0a0c',
  /** Quality preset reference (resolved at runtime from globeStore) */
  get qualityPreset() {
    // Lazy reference — actual value comes from globeStore.qualityPreset
    // This getter provides a default for initialization contexts
    return {
      earthSegments: 128,
      cloudSegments: 96,
    };
  },
  CAMERA: {
    MIN_DISTANCE: 1.35,
    MAX_DISTANCE: 4.2,
    DOLLY_SPEED: 0.3,
    ROTATE_SPEED: 0.5,
    DRAG_SMOOTH_TIME: 0.12,
    SMOOTH_TIME: 0.2,
    MIN_POLAR_ANGLE: 0.1,
    MAX_POLAR_ANGLE: Math.PI - 0.1,
    INITIAL_POSITION: [0, 0, 3.5] as readonly [number, number, number],
    FOV: 55,
  },
  /** Point cloud earth rendering — subtle terrain hint, not dominant */
  POINT_CLOUD: {
    COUNT_HIGH: 75_000,
    COUNT_MEDIUM: 40_000,
    COUNT_LOW: 20_000,
    POINT_SIZE: 0.5,
    ELEVATION_SCALE: 0.02,
    LAND_BRIGHTNESS_LOW: 0.18,
    LAND_BRIGHTNESS_HIGH: 0.08,
    OCEAN_COLOR: [0.02, 0.04, 0.08] as readonly [number, number, number],
    OCEAN_ALPHA: 0.0,
    OCEAN_THRESHOLD: 0.20,
    FRESNEL_COLOR: [0.2, 0.3, 0.4] as readonly [number, number, number],
    FRESNEL_POWER: 5.0,
    FRESNEL_INTENSITY: 0.05,
    /** Max land alpha — keeps terrain subtle so data layers dominate */
    LAND_ALPHA: 0.22,
  },
  /** Voxel Atmosphere — 3D volumetric PM2.5 at station locations */
  VOXEL_ATMOSPHERE: {
    PM25_THRESHOLD: 50,
    HEIGHT_LEVELS: [0.02, 0.05, 0.10, 0.18, 0.28] as readonly number[],
    BASE_RADIUS: 0.015,
    RADIUS_GROWTH: 1.4,
    OPACITY_BASE: 0.25,
    OPACITY_DECAY: 0.7,
    GLOBE_R: 1.005,
  },
  /**
   * DQSS-based marker transparency — renders reliability directly on the
   * station/prediction marker's alpha channel (instanceAlpha.ts). Was
   * `LIGHT_BEAMS.DQSS_OPACITY` / `DQSS_MATCH_RADIUS_DEG` — the light-beam
   * renderer these keys were named after was never built (0 consumers); the
   * two live keys are renamed here to describe what they actually drive.
   */
  DQSS_ENCODING: {
    /** Opacity tiers by DQSS score range (0-100). */
    OPACITY: {
      HIGH:    { MIN_SCORE: 80, OPACITY: 1.0  },
      MEDIUM:  { MIN_SCORE: 50, OPACITY: 0.6  },
      LOW:     { MIN_SCORE: 20, OPACITY: 0.3  },
      MINIMAL: { MIN_SCORE: 0,  OPACITY: 0.15 },
      /** Fallback when DQSS data is unavailable for a station */
      DEFAULT: 0.5,
    },
    /** Max distance (degrees) for lat/lon matching to DQSS stations */
    MATCH_RADIUS_DEG: 0.05,
  },
  /** 3-light system for point cloud globe */
  LIGHTS: {
    AMBIENT_INTENSITY: 0.15,
    RIM: {
      COLOR: '#4488cc',
      INTENSITY: 0.6,
      POSITION: [-2, 1, -3] as readonly [number, number, number],
    },
    BACK: {
      COLOR: '#223344',
      INTENSITY: 0.4,
      POSITION: [3, -1, 2] as readonly [number, number, number],
    },
  },
  /** Wind texture pipeline — Edge Function → PNG encoding */
  WIND_TEXTURE: {
    /** Edge Function URL for wind texture PNG */
    EDGE_FUNCTION_PATH: '/functions/v1/wind-texture',
    /** Texture resolution (width × height) */
    WIDTH: 512,
    HEIGHT: 256,
    /** U/V wind component scale bounds (m/s) */
    SCALE_MIN: -100,
    SCALE_MAX: 100,
    /** Cache TTL matching Open-Meteo refresh (ms) */
    CACHE_TTL_MS: 30 * 60 * 1000,
  },
  /** LineSegments trail particle system (nullschool-style) */
  WIND_TRAILS: {
    /** Per-tier particle counts — increased for higher fidelity Nullschool aesthetic */
    TRAIL_COUNTS: {
      high: 30_000,
      medium: 15_000,
      low: 6_000,
    } as const,
    /** Per-tier trail history length — useFrame cost = count × length */
    TRAIL_LENGTHS: {
      high: 80,
      medium: 56,
      low: 36,
    } as const,
  },
  /** Ping-pong FBO particle system */
  PARTICLES: {
    /** Position texture size (side length, total slots = size²) */
    TEXTURE_SIZE: 512,
    /**
     * Per-tier counts trade some density for longer trajectories. The vertex budget
     * stays near the former 100K×7-segment high tier; mobile keeps a hard cap.
     */
    COUNT_HIGH: 30_000,
    COUNT_HIGH_MOBILE: 15_000,
    COUNT_MEDIUM: 18_000,
    COUNT_LOW: 6_000,
    /**
     * Particle max age in 60fps-frames. Keeps global coverage replenishing as
     * the more legible advection scale moves each path farther.
     */
    MAX_AGE: 140,
    /**
     * Visual scale: surface median (5.6 m/s) crosses the line-vs-dot threshold;
     * 20 m/s reads decisively faster without turning into a strobing field.
     */
    SPEED_FACTOR: 0.0072,
    /** Physical speed where visual colour/length encoding saturates. */
    SPEED_REFERENCE_MPS: WIND_SPEED_MAX_MPS,
    /** Calm trails show only their head; strong wind reveals almost the full history. */
    TRAIL_CALM_CUTOFF: 0.45,
    TRAIL_FAST_CUTOFF: 0,
    TRAIL_ALPHA_POWER: 1.15,
    /** FLOW may tint a trail with pollution, but never erases its speed colour. */
    POLLUTION_BLEND_MAX: 0.68,
    /** Preserve essential flow while reducing unsolicited full-screen motion. */
    REDUCED_MOTION_SCALE: 0.2,
    /**
     * Delta-time normalization baseline — MAX_AGE / SPEED_FACTOR are authored
     * in "frames at 60fps". Advection multiplies by clamp(delta)*REFERENCE_FPS
     * so 120/144Hz displays no longer double the flow speed.
     */
    REFERENCE_FPS: 60,
    /** Nullschool-like temporal sampling: 25fps yields long paths without extra GPU samplers. */
    TRAIL_SAMPLE_FPS: 25,
    /** Per-frame delta clamp (s) — a background-tab return must not teleport particles */
    MAX_DELTA_S: 0.05,
    /**
     * Maximum chord span between adjacent trail snapshots. Normal advection
     * remains well below this bound; respawns and corrupt ring discontinuities
     * are collapsed before rasterization instead of flashing across the globe.
     */
    TRAIL_MAX_SEGMENT_DEG: 12,
    /**
     * Per-step angular displacement cap (deg) applied to dLon and dLat
     * independently. Last-resort guard against "jumping" particles: encode-side
     * clamping bounds |u,v| ≤ 100 m/s, but the cos(lat) longitude correction
     * amplifies dLon up to ~11.5× near the ±85° clamp (worst case
     * 100 × 0.0072 × 11.5 exceeds 2.0 deg/frame, so this cap prevents polar
     * and decode extremes from teleporting while normal flow stays linear.
     */
    MAX_STEP_DEG: 2,
    /**
     * Floor for the cos(lat) divisor in the longitude correction — cos(85°),
     * matching the advection lat clamp (±85°), so the polar amplification is
     * finite and continuous at the clamp boundary.
     */
    COS_LAT_FLOOR: 0.0872,
    /** Trail line width */
    LINE_WIDTH: 2.5,
    /** Opacity */
    OPACITY: 0.9,
    /** Temporal lerp duration for smooth data transition (ms) */
    TRANSITION_DURATION_MS: 2000,
  },
  /** P3 GPUComputationRenderer particle path — texture bake + fallback + telemetry tuning. */
  GPU_PARTICLES: {
    /** Pollution grid bake resolution for the vertex-shader lookup (equirectangular). */
    POLLUTION_TEXTURE_WIDTH: 180,
    POLLUTION_TEXTURE_HEIGHT: 90,
    /**
     * Tier-adaptive GPU history sampled at TRAIL_SAMPLE_FPS. High spans 560ms;
     * low keeps a 280ms trace. ring + pollution stays within WebGL2's portable
     * minimum of 16 vertex texture samplers.
     */
    RING_SIZE_HIGH: 15,
    RING_SIZE_HIGH_MOBILE: 12,
    RING_SIZE_MEDIUM: 12,
    RING_SIZE_LOW: 8,
    /** Last-resort guard: sustained sub-floor FPS on the lowest quality tier drops to CPU. */
    LOW_TIER_FPS_FLOOR: 30,
    LOW_TIER_FPS_WINDOW_FRAMES: 90,
    /** globe_particle_fps telemetry throttle — avoid flooding PostHog every frame. */
    TELEMETRY_FPS_THROTTLE_MS: 10_000,
    TELEMETRY_FPS_SESSION_CAP: 30,
  },
  POLLUTION_TINT: {
    RADIUS_DEG: 15,
    MAX_PM25: 300,
    MIN_PM25: 35,
    FIRE_FRP_TO_PM25_FACTOR: 2,
    FIRE_FRP_DEFAULT: 10,
    FIRE_PM25_THRESHOLD: 30,
    MIX_FACTOR: 0.85,
    BRIGHTNESS_REDUCTION: 0.3,
  },
} as const;

export const GLOBE_COLORS = {
  ATMOSPHERE_DAY: '#4db2ff',
  ATMOSPHERE_TWILIGHT: '#fd5e53',
  OCEAN: '#1a4a6e',
  WIREFRAME_LOADING: '#0a1628',
  STATION_SATELLITE: '#22d3ee',
  FALLBACK_GRADIENT: ['#0E2B36', '#0A1E27', '#020A0F'] as const,
  COUNTRY_LABEL: '#cfe8f5',
  LABEL_OUTLINE: '#0a0f1a',
  WIND_AQI_RAMP: ['#4ade80', '#fbbf24', '#f97316', '#ef4444', '#6b21a8'] as const,
  SATELLITE_RING: '#22d3ee',
  SATELLITE_PULSE: '#67e8f9',
  FORECAST_ACCENT: '#a855f7',
  MAGAZINE_HOVER: '#1d4e8e',
} as const;

/** Country border lines — bright enough to read over terrain shading */
export const COUNTRY_BORDER = {
  RADIUS_OFFSET: 0.006,
  COLOR: 0xbfe9ff,
  OPACITY: 0.9,
  GLOW_COLOR: VIZ_ACCENT_0X,
  GLOW_OPACITY: 0.4,
} as const;
