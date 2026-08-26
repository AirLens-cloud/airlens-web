/**
 * Globe rendering configuration — barrel module.
 *
 * Split into domain-specific sub-modules:
 *   globe-v2.ts      — Three.js/R3F Globe V2 renderer settings
 *   globe-presets.ts  — Theme presets, dot matrix, ocean sphere, starfield.
 *
 * This file assembles the unified GLOBE_CONFIG object and re-exports
 * all named exports so existing import paths remain unchanged.
 */

import { GLOBE_V2_CONFIG } from './globe-v2';
import { VIZ_ACCENT_HEX } from './viz';

/** Immersive data-viz accent — SOT = lib/config/viz.ts (CSS mirror: reado.css --viz-accent). GL/Three.js 는 CSS var 불가. */
const VIZ_ACCENT = VIZ_ACCENT_HEX;

/**
 * HAZARDOUS 등급 dark-ink red — AQ_SPIKES 6-tier 최상단과 ALERT_PULSE 링이 공유하는 단일 SOT.
 * 스파이크 색(등급)과 그 위 경보 링이 반드시 같은 빨강이어야 의미 정합이 유지된다(참조 수렴, drift 차단).
 */
const HAZARDOUS_RED = '#991b1b' as const;

// Re-export standalone configs (consumers import these by name)
export {
  GLOBE_THEME_PRESETS,
  DOT_MATRIX_CONFIG,
  OCEAN_SPHERE_CONFIG,
  STARFIELD_CONFIG,
} from './globe-presets';

export const GLOBE_CONFIG = {
  // AQ Spikes Rendering Constants (Three.js InstancedMesh)
  AQ_SPIKES: {
    MIN_HEIGHT: 0.012,
    MAX_HEIGHT: 0.18,
    PM25_MAX: 200,         // Clamp for spike height calculation
    GLOBE_R: 1.003,
    SPIKE_RADIUS: 0.0018,
    HEIGHT_EXPONENT: 0.6,  // Eased mapping exponent for visual clarity
    // 색 팔레트와 임계값은 서로 다른 축이다 — 아래 두 블록의 변경 규칙이 다르다.
    //
    // COLORS = vivid stage palette (immersive dark globe) — 사이트의 desaturated EPA 토큰과
    // 의도적 분리. **값 변경 안 함(문서화만)** — 재검토 시 명도-단조 정렬 고려.
    // Deuteranopia(적록색약) 근사 검토: 인접쌍 대부분 blue-채널/명도로 구분되나 두 쌍이 주의 대상 —
    //   GOOD(green) ↔ MODERATE(cyan): green-채널 손실 시 근접(중간 위험).
    //   USG(amber) ↔ UNHEALTHY(red): 고전적 amber/red 혼동(중간~높음).
    // 완화 = 스파이크 높이(height)가 PM2.5 크기를 색과 별개로 이중 부호화 → 색 혼동을 구제(redundant channel).
    COLORS: {
      GOOD: '#10b981',          // Good (≤9) — green
      MODERATE: VIZ_ACCENT,      // Moderate (≤35) — cyan
      USG: '#f59e0b',           // Unhealthy for Sensitive Groups (≤55) — amber
      UNHEALTHY: '#ef4444',     // Unhealthy (≤125) — red
      VERY_UNHEALTHY: '#8b5cf6', // Very Unhealthy (≤225) — purple
      HAZARDOUS: HAZARDOUS_RED,  // Hazardous (>225) — dark red (ALERT_PULSE 링과 공유 SOT)
    },
    // THRESHOLDS = 순방향 분류 임계값 (PM2.5 µg/m³) — **US EPA 2024 개정표를 따른다.**
    // 개정으로 움직인 경계는 GOOD 12→9 / UNHEALTHY 150→125 / VERY_UNHEALTHY 250→225 세 개뿐.
    // 소비처는 geoUtils.ts pm25ToSpikeColor(렌더)와 GlobeLegend.tsx(범례) 둘뿐이고 같은 배열을
    // 읽으므로 표시-렌더 불일치가 없다.
    // aqi.ts EPA_PM25_BREAKPOINTS 와 혼동 금지 — 그쪽은 WAQI 디코더라 pre-2024 유지가 의도다.
    THRESHOLDS: {
      GOOD: 9,
      MODERATE: 35,
      USG: 55,
      UNHEALTHY: 125,
      VERY_UNHEALTHY: 225,
    },
    // Maximum PM2.5 value after AQI conversion (clamp ceiling)
    PM25_CLAMP_MAX: 300,
    // Reveal animation duration (seconds) for easeOutExpo grow-in
    REVEAL_DURATION: 1.5,
    // Base ring indicator geometry (RingGeometry radii, globe-surface units)
    BASE_RING_INNER: 0.003,
    BASE_RING_OUTER: 0.005,
    // Canvas 2D spike overlay (COBE mode)
    MIN_PM25_THRESHOLD: 20,    // Only show spikes above this PM2.5 level
    MAX_HEIGHT_PX: 60,         // Max spike height in CSS pixels
    PM25_MAX_FOR_HEIGHT: 200,  // PM2.5 value that maps to max height
  },

  // ML Predictions — 자체 AODtoPM25 v2 도시 예측 마커 (grid_latest.json).
  // 관측소 아이콘(채운 아이콘, GLOBE_R 1.005)과 시각 구분 위해 hollow 링 + 약간 큰 크기 + 살짝 높은 표면.
  ML_PREDICTIONS: {
    GLOBE_R: 1.006,          // 관측소 아이콘(1.005) 위로 살짝 띄워 겹침 판독 용이
    ICON_SIZE: 0.02,         // 관측소 아이콘(0.012)보다 커서 예측층임을 시각 신호
    MAX_MARKERS: 2000,       // 현재 65 — 상한은 여유
    RING_TEXTURE_SIZE: 64,   // hollow-ring 캔버스 텍스처 해상도(px)
    RING_STROKE_FRAC: 0.14,  // 링 선폭(텍스처 크기 대비 비율) — 얇은 링 + 빈 중앙 = 예측(모델링) 신호
    RING_DOT_FRAC: 0.10,     // 중앙 점 반지름 비율(중앙 추정 p50 표시 — 조준점 형태)
    OPACITY: 0.95,
    HOVER_THROTTLE_MS: 50,
    // 밴드 신뢰성 disclosure(§5) — v2 검증 지표. model_version 과 함께 표기.
    COVERAGE: {
      NOMINAL: 0.80,         // p10–p90 = 명목 80% 구간
      // 발행 밴드 **자체의** 실측 포함률(PICP)은 아직 없다. 여기 있던 0.734 는
      // 레포 어느 아티팩트에도 근거가 없었다 — #908 이 커밋 메시지에 "약 73.4%"
      // 라고만 적고 아티팩트를 인용하지 않았고, Data 트리에서 PICP 를 담은 파일은
      // `Data/4-ml-pipeline/eval/aod_spatial_cv_weather_baseline_2026-07-11.json`
      // 하나뿐인데 그 값은 picp80_mean 0.738 이다.
      //
      // 그 0.738 로 갈아끼우지도 않았다. 그건 bare XGB 분위회귀를 잰 값이고 발행
      // 밴드는 XGB+LGB 블렌드에 p50 만 GTWR 보정한 **다른 추정기**다 — #1039 가
      // PICP80 0.80 에서 잡아낸 것과 같은 귀속 오류라, 산술만 고치면 틀린 귀속이
      // 그대로 남는다. 숫자는 내리고 under-coverage 방향 경고는 남긴다(§5).
      EMPIRICAL_PICP: null,
    },
    // 마커 alpha = p10-p90 밴드 상대폭(instanceAlpha.ts 경유). 넓을수록(불확실성
    // 클수록) 흐리게 — 실 발행 데이터의 밴드 상대폭은 ~1%라 현재는 사실상 전 마커
    // alpha≈1(불투명)로 보인다. 이는 데이터 속성이지 배선 결함이 아니다.
    BAND_ALPHA: {
      REL_WIDTH_FULL: 0.5, // (p90-p10)/p50 이 이 값 이상이면 MIN까지 감쇠
      MIN: 0.35,           // 최저 alpha — 마커가 사라지지는 않게(판독성 하한)
      DEFAULT: 0.7,        // 밴드 부재 시 — fabricate 금지, 중간값으로 정직 표기
    },
  },

  // Alert Pulse — WHO threshold warning rings around high-PM2.5 spikes
  ALERT_PULSE: {
    CATEGORY_THRESHOLD: 3,    // UNHEALTHY (category >= 3) triggers alert
    RING_INNER: 0.006,
    RING_OUTER: 0.012,
    PULSE_SPEED: 2.0,         // oscillation speed (radians/sec)
    MAX_SCALE: 2.5,           // maximum ring expansion
    ALPHA_BASE: 0.3,          // base opacity — paper/ink restraint (was 0.6)
    DOUBLE_RING_DELAY: 0.35,  // seconds between primary and secondary ring
    SECONDARY_ALPHA: 0.35,    // secondary ring opacity ratio
    COLOR: HAZARDOUS_RED,      // dark ink-red — AQ_SPIKES.HAZARDOUS 와 공유 SOT (참조 수렴)
  },

  // DotMap 1km Grid LOD — camera distance-based level of detail
  DOTMAP_GRID: {
    // LOD distance thresholds (camera distance from globe center)
    LOD0_DISTANCE: 1.8,      // closest zoom → full density
    LOD1_DISTANCE: 2.8,      // mid zoom → standard density
    // LOD dot counts per quality tier [LOD0, LOD1, LOD2]
    COUNTS_HIGH: [40000, 12000, 4000],
    COUNTS_MEDIUM: [20000, 7000, 3000],
    COUNTS_LOW: [8000, 3000, 1500],
    // Oversample multiplier for sunflower generation (land filter)
    OVERSAMPLE: 3.2,
    // Transition smoothing speed (higher = faster LOD snap)
    TRANSITION_SPEED: 3.0,
  },

  // SDID 3D Timeline — branching actual vs counterfactual ribbon on globe
  SDID_TIMELINE: {
    RIBBON_WIDTH: 0.015,       // width of ribbon in globe units
    HEIGHT_SCALE: 0.0008,      // PM2.5 value → globe height units
    TIME_STEP: 0.008,          // globe units per date step
    ACTUAL_COLOR: VIZ_ACCENT,   // brand teal
    COUNTERFACTUAL_COLOR: '#6b7280', // gray-500
    BRANCH_POINT_SIZE: 0.004,  // sphere size at implementation date
    EFFECT_FILL_COLOR: '#10b98133', // green-500 with alpha
    GLOBE_R: 1.01,             // slightly above surface
    REVEAL_DURATION: 1.5,      // seconds for draw-on animation
  },

  // Globe Heatmap Rendering Constants
  // ALPHA_BASE lifted 0.22→0.35 so low-concentration cells stay visible over the
  // dark night-side earth (the satellite/AQ grid otherwise reads as near-black there).
  GLOBE_HEATMAP: {
    RADIUS_MIN: 40,
    RADIUS_MAX: 90,
    PM25_RADIUS_COEFF: 0.55,
    ALPHA_MAX: 0.85,
    ALPHA_BASE: 0.35,
    ALPHA_PM25_DIVISOR: 130,

    // ── Observation-density confidence decay (idwCore densityAlphaFactor) ──
    // alpha = clamp(valueAlpha, ALPHA_MAX) × densityFactor. What gets faded is not
    // "how polluted" but "how much observation this cell rests on": the IDW-weighted
    // mean distance to the points that produced it.
    //
    // DEG values are judgement calls, not measured — anchors, not evidence:
    //   FULL 3°  — stricter than the grid feed this path substitutes for, which
    //              itself claims 5° cells as observation (globeOntology aqPipeline).
    //   FADE 12° — leaves a 3° plateau before the existing maxDistDeg=15 hard cutoff,
    //              so the decay gradient and the cutoff edge don't stack in a few px.
    //              On a 1024×512 texture the 3→12° ramp spans ~26 px.
    // Revisit by eye: see the request-blocking repro in the PR body (this path only
    // runs when Storage + Edge Fn + the bundled static grid all fail).
    DENSITY_FULL_DEG: 3,
    DENSITY_FADE_DEG: 12,
    // Floor chosen against the ALPHA_BASE history above, not picked freely:
    // 0.35 × 0.65 = 0.2275 ≥ 0.22, i.e. a maximally-faded low-concentration cell
    // still sits above the pre-lift alpha that was judged too dark on the night side.
    DENSITY_ALPHA_MIN: 0.65,

    // Marks the IDW fallback in activeGridMeta.source. GlobeLegend branches on this
    // to show the interpolation caveat — keep it a single constant so the two sides
    // cannot drift apart and silently drop the caveat.
    //
    // Value is lifted verbatim from the previous ScalarFieldOverlay literal. "stations"
    // is a misnomer — fetchGlobalMarkers returns global_grid Edge Fn cells
    // (station_id 'grid-N'), not physical stations. Renaming it is a user-visible copy
    // change and is deliberately left out of this PR so promoting the constant stays
    // a pure refactor; the legend caveat below already says "observation points".
    IDW_SOURCE_LABEL: 'AirLens stations (IDW)',

    // P8b timeline cross-fade (V-W3) — dual-texture opacity blend between two
    // real, already-fetched GEFS frames (never a data interpolation — see
    // ScalarFieldOverlay.tsx header). Mirrors reado.css `--dur-base` (280ms) so
    // the shader tween and the rest of the page's motion read as one system.
    TIMELINE_CROSSFADE_MS: 280,
    // WindParticles dim target while the timeline shows a non-live frame. Wind
    // has no forecast feed (only current surface/850hPa), so particles must not
    // read as "the forecast wind" while a past/future PM2.5 frame is on screen —
    // Glass-box honesty, not a performance knob.
    WIND_TIMELINE_DIM_OPACITY: 0.3,
  },

  // ── Globe V2 (Three.js/R3F renderer) — assembled from globe-v2.ts ──
  GLOBE_V2: GLOBE_V2_CONFIG,

  // Transboundary PM2.5 transport corridors — preserved from the retired COBE
  // hero-globe config family (#913); still consumed by DataArcs.tsx.
  ARC_ROUTES: [
    { from: [39.90, 116.41] as readonly [number, number], to: [37.57, 126.98] as readonly [number, number] }, // Beijing → Seoul
    { from: [37.57, 126.98] as readonly [number, number], to: [35.68, 139.65] as readonly [number, number] }, // Seoul → Tokyo
    { from: [48.86, 2.35] as readonly [number, number], to: [51.51, -0.13] as readonly [number, number] },    // Paris → London
    { from: [51.51, -0.13] as readonly [number, number], to: [52.52, 13.41] as readonly [number, number] },    // London → Berlin
    { from: [28.61, 77.21] as readonly [number, number], to: [39.90, 116.41] as readonly [number, number] },   // Delhi → Beijing
    { from: [40.71, -74.01] as readonly [number, number], to: [34.05, -118.24] as readonly [number, number] }, // NYC → LA
    { from: [40.71, -74.01] as readonly [number, number], to: [51.51, -0.13] as readonly [number, number] },   // NYC → London
    { from: [-33.87, 151.21] as readonly [number, number], to: [37.57, 126.98] as readonly [number, number] }, // Sydney → Seoul
    { from: [55.76, 37.62] as readonly [number, number], to: [52.52, 13.41] as readonly [number, number] },    // Moscow → Berlin
    { from: [-23.55, -46.63] as readonly [number, number], to: [40.71, -74.01] as readonly [number, number] }, // São Paulo → NYC
  ],

  // Globe Background Star Field
  GLOBE: {
    STAR_FIELD: {
      /** Star count per quality tier */
      COUNT: { high: 3000, medium: 1500, low: 600 } as Record<string, number>,
      /** Inner/outer radius of the star shell (beyond globe at ~1.0) */
      INNER_RADIUS: 3,
      OUTER_RADIUS: 12,
      /** [min, max] point size in world units */
      SIZE_RANGE: [0.02, 0.12] as readonly [number, number],
      /** [min, max] base brightness (0-1) */
      BRIGHTNESS_RANGE: [0.15, 0.9] as readonly [number, number],
    },
  },

  // Globe Performance Tuning
  GLOBE_PERFORMANCE: {
    CLUSTER_ZOOM_THRESHOLD: 2.8,       // Camera distance above which markers cluster
    LOD_DISTANCES: [1.5, 2.5, 3.5],   // [close, medium, far] breakpoints
    MAX_CITIES: 500,                   // Maximum number of city markers to render
  },

  // Visual Theme (Three.js / Globe) - Fallbacks
  GLOBE_THEME: {
    VIZ_ACCENT,
    BG_COLOR: '#040d12',
    EARTH_COLOR: '#1a3a5a',
    EMISSIVE_COLOR: '#001827',
    ATMOSPHERE_COLOR: VIZ_ACCENT,
    CLOUDS_COLOR: '#ffffff',
    UNITS_MARKER_COLOR: '#81c784',
    STATION_MARKER_COLOR: '#60a5fa',
    // Bio-Digital extended palette
    CYBER_SAGE: '#74A892',
    QUANTUM_BLUE: '#1B3B6F',
    BIO_ORANGE: '#FF7F41',
    PARTICLE_BLUE: '#2D4B8E',
    DOTMAP_BASE_COLOR: '#74A892',
    DOTMAP_HIGHLIGHT_COLOR: VIZ_ACCENT,
    DOTMAP_POLICY_COLOR: '#FF7F41',
    // Country grouping highlight (Phase 1)
    DOTMAP_COUNTRY_HIGHLIGHT: VIZ_ACCENT,
    DOTMAP_COUNTRY_DIM: 0.3,
    // Aurora effect (Phase A1)
    AURORA: {
      PRIMARY_COLOR: '#00ff88',
      SECONDARY_COLOR: VIZ_ACCENT,
      INTENSITY: 0.6,
      SPEED: 0.15,
      LATITUDE_MIN: 60,
      NOISE_SCALE: 3.0,
    },
    // Data Arc draw-on (Phase A3)
    ARC: {
      DRAW_SPEED: 0.4,
      IMPACT_RING_DURATION: 1.5,
      IMPACT_RING_MAX_SCALE: 3.0,
      IMPACT_RING_COLOR: '#5a5d63', // wf-ink-3 hex — connector lines defer to data, not compete
      // Phase 4: Double-ring ripple (Stripe style)
      DOUBLE_RING_DELAY: 0.15,      // seconds offset for second ring
      DOUBLE_RING_ALPHA_RATIO: 0.6, // second ring alpha multiplier
      // Phase 2: Tube arc geometry (Stripe/GitHub style)
      TUBE_RADIUS: 0.002,
      TUBE_RADIAL_SEGMENTS: 4,
    },
    // Particle pollution modulation (Phase A5)
    PARTICLES: {
      DENSITY_MULTIPLIER: 2.5,
      POLLUTION_COLOR_SCALE: 1.0,
    },
    // FlyTo camera motion (Phase 4 — CameraController 배선 완료)
    FLYTO: {
      /** Fly-to animation duration (seconds). */
      DURATION_S: 1.1,
      /** Great-circle mid-path bulge peak radius — peak = max(from, to, this). */
      ARC_RADIUS: 2.4,
      /** Camera distance from origin at fly-to arrival. */
      ZOOM_DISTANCE: 1.8,
      /** Entry cinematic — camera starts this many times farther out, then arcs in. */
      INTRO_PUSHBACK_MULTIPLIER: 1.7,
    },
    // Outer halo glow (Phase 3 — haloShader)
    HALO_COLOR: VIZ_ACCENT,
    HALO_INTENSITY: 0.12,
  },

  /**
   * NASA FIRMS fire hotspot layer — "ember" identity.
   * Radial glow sprite (additive, toneMapped:false) so hotspots read as burning
   * light on the dark night-side earth, not flat dots. Per-instance tint ramps by
   * FRP from deep ember → white-hot; the sprite texture supplies the core→edge falloff.
   */
  FIRE_HOTSPOTS: {
    GLOBE_R: 1.015,
    MIN_SIZE: 0.007,
    MAX_SIZE: 0.022,
    FRP_MAX: 200,
    COLOR_LOW: '#ff7a18',   // deep ember (low FRP)
    COLOR_HIGH: '#ffe7a0',  // white-hot (high FRP)
    // Radial glow sprite stops (core → mid → edge, edge fully transparent)
    CORE_COLOR: '#fff6e0',
    MID_COLOR: '#ffb347',
    EDGE_COLOR: '#ff5a1f',
    TEXTURE_SIZE: 64,
    OPACITY: 0.95,
    PULSE_SPEED: 2.0,
    PULSE_AMPLITUDE: 0.22,  // subtle flicker, per-instance phase
  },

  SMOKE_EMITTER: {
    GLOBE_R: 1.018,
    PARTICLE_COUNTS: { high: 500, medium: 200, low: 100 },
    MAX_AGE: 60,
    SPEED_FACTOR: 0.004,
    // Smoke is non-emissive drift — warm ash near the fire cooling to grey haze as it
    // rises/disperses. Never fade to black (was #ef4444 → #0a0a0a, invisible on the
    // dark globe); both ends stay above the night-side floor.
    COLOR_LOW: '#d8ccbb',   // warm ash near source
    COLOR_HIGH: '#8b93a0',  // cool grey, dispersed
    OPACITY_START: 0.5,
    OPACITY_END: 0.0,
    SIZE_START: 0.003,
    SIZE_END: 0.008,
    RISE_HEIGHT: 0.05,
  },

  POLLEN_PARTICLES: {
    GLOBE_R: 1.012,
    PARTICLE_COUNTS: { high: 2000, medium: 800, low: 300 } as Record<string, number>,
    MAX_AGE: 120,
    SPEED_FACTOR: 0.0015,
    FLOAT_AMPLITUDE: 0.003,
    FLOAT_SPEED: 0.8,
    ROTATION_SPEED: 0.5,
    SIZE_MIN: 0.003,
    SIZE_MAX: 0.007,
    OPACITY: 0.75,
    TEXTURE_SIZE: 64,
    COLOR_LOW: '#ffc0e0',
    COLOR_HIGH: '#db2777',
  },

  /** Country selection extrude overlay */
  COUNTRY_EXTRUDE: {
    SURFACE_R: 1.015,
    EDGE_R: 1.016,
    SURFACE_OPACITY: 0.45,
    EDGE_OPACITY: 0.9,
    COLOR: VIZ_ACCENT, // string hex — THREE.Color / lineBasicMaterial 모두 수용 (Phase 1 accent 수렴)
    ANIM_SPEED: 5.0,
  },
} as const;
