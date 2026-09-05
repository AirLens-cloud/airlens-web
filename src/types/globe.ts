/**
 * Globe domain types — ported from AirLens-platform apps/web
 * `src/types/globe.ts` (G1 engine landing).
 *
 * The overlay/grid/snapshot shapes the data layer already owns live in
 * `./data` and are re-exported here verbatim rather than redeclared, so the
 * Globe tree and `api/` agree on exactly one `OverlayType` union.
 */
import type {
  WindGridPoint,
  WindFieldMeta,
  PressureLevel,
  OverlayType,
  OverlayGridData,
  PM25Grade,
  GlobalGridCell,
  GlobalGridSnapshot,
  GlobalGridSnapshotOptions,
  WindLevel,
} from './data'

export type {
  WindGridPoint,
  WindFieldMeta,
  PressureLevel,
  OverlayType,
  OverlayGridData,
  PM25Grade,
  GlobalGridCell,
  GlobalGridSnapshot,
  GlobalGridSnapshotOptions,
  WindLevel,
}

// types/globe.ts — Globe 도메인 타입 정의

import type React from 'react';
import type * as THREE from 'three';

// ── Country Mask (Globe Dot Map — Phase 1) ──

export interface CountryMaskData {
  data: Uint8Array;         // per-pixel land/ocean flag (0=ocean, >0=land) — backward-compat
  width: number;
  height: number;
  countryIds: Float32Array; // per-pixel country ID (0=ocean, 1-255=country index)
  colorMap: Map<number, string>; // countryId → ISO A3 code
}

// ── Globe — Selected Country (Phase 1 Country Click) ──

export interface SelectedCountry {
  code: string;        // ISO A3 country code
  name: string;
  flag: string;        // emoji flag
  lat: number;
  lon: number;
}

// ── Globe — Camera Fly-To (Phase 3 Search / Shared URL) ──

/** Camera fly-to request (search result / URL hydrate) */
export interface FlyToTarget {
  lat: number;
  lon: number;
  /** camera distance from origin — default CameraController ZOOM_DISTANCE */
  distance?: number;
}

/**
 * User-facing atmospheric reading modes. Each mode resolves to a truthful
 * bundle of existing globe layers; it is not a cosmetic tab state.
 */
export type AtmosphericMode = 'live' | 'forecast' | 'events' | 'transport' | 'policy';

// ── Globe — Layer Category (Legend UX) ──

export type LayerCategoryKey =
  | 'MEASUREMENT'
  | 'QUALITY'
  | 'ANALYSIS'
  | 'COVERAGE'
  | 'TRANSPORT'
  | 'FORECAST'
  | 'TERRAIN';

// ── Globe — Wind Grid (Phase 2 Real Wind) ──


// ── Globe — Static PM2.5 Grid (country summary aggregate) ──

export interface GridPoint {
  lat: number;
  lon: number;
  value: number;       // PM2.5 µg/m³
}

// ── Globe Enhancement Types (Phase A-E) ──

export interface AuroraConfig {
  PRIMARY_COLOR: string;
  SECONDARY_COLOR: string;
  INTENSITY: number;
  SPEED: number;
  LATITUDE_MIN: number;
  NOISE_SCALE: number;
}

export interface ArcImpactConfig {
  DRAW_SPEED: number;
  IMPACT_RING_DURATION: number;
  IMPACT_RING_MAX_SCALE: number;
  IMPACT_RING_COLOR: string;
}

export interface AlertPulseConfig {
  CATEGORY_THRESHOLD: number;
  RING_INNER: number;
  RING_OUTER: number;
  PULSE_SPEED: number;
  MAX_SCALE: number;
  ALPHA_BASE: number;
  DOUBLE_RING_DELAY: number;
  SECONDARY_ALPHA: number;
}

export interface SDID3DTimelineConfig {
  RIBBON_WIDTH: number;
  HEIGHT_SCALE: number;
  TIME_STEP: number;
  ACTUAL_COLOR: string;
  COUNTERFACTUAL_COLOR: string;
  BRANCH_POINT_SIZE: number;
  EFFECT_FILL_COLOR: string;
  GLOBE_R: number;
  REVEAL_DURATION: number;
}

export interface GlobeHUDData {
  currentAQI: number | null;
  location: string | null;
  dataFreshness: 'live' | 'stale' | 'offline';
}

export interface HoveredStation {
  lat: number;
  lon: number;
  pm25: number;
  name?: string;
  dqss?: number;
  /** dqss 값이 어디서 왔는지 (§5 Glass-box). 값과 함께 이동한다. */
  dqss_provenance?: DQSSProvenance;
}

/** Globe marker cluster for zoom-based aggregation */
export interface MarkerCluster {
  centroid: [number, number];
  count: number;
  avgPm25: number;
  avgDqss: number;
}

// ── Globe Layer Panel Types ──

/** Configuration for a single layer toggle button in the Globe panel */
export interface GlobeLayerButtonConfig {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
  onToggle: () => void;
  /** Tailwind color suffix for active bg/border (e.g. 'primary', 'emerald-500') */
  activeColor: string;
  /** CSS hex glow color for the status dot */
  glowColor: string;
  /** Tailwind class for icon active color (e.g. 'text-primary') */
  iconActiveClass: string;
  /** Only render if this evaluates to true (defaults to true) */
  visible?: boolean;
  /** Short description of what this layer visualizes */
  description?: string;
}

/** Layer preset quick-apply configuration */
export interface GlobeLayerPreset {
  label: string;
  apply: () => void;
}

// ── Globe Layer Types ──

/** Sensor ownership category from station metadata */
export type SensorType = 'government' | 'community' | 'unknown';

/** Single attribution entry from station metadata */
export interface StationAttribution {
  url: string;
  name: string;
  logo?: string;
}

/** Unified station record used by globe marker & heatmap layers */
export interface GlobalStationRecord {
  location?: { geo?: [number, number] };
  coordinates?: [number, number];
  pollutants?: { pm25?: number };
  pm25?: number;
  name?: string;
  p10?: number;
  p90?: number;
  dqss?: number;
  source?: string;
  dqss_freshness?: number;
  dqss_completeness?: number;
  dqss_consistency?: number;
  dqss_stability?: number;
  dqss_model_residual?: number;
  attribution?: StationAttribution[];
  sensor_type?: SensorType;
  station_uid?: string;
}

export interface DQSSStation {
  station_id: string;
  lat: number;
  lon: number;
  final_score: number;
  badge?: string;
  badge_color?: string;
  freshness?: number;
  completeness?: number;
  consistency?: number;
  stability?: number;
  model_residual?: number;
}

/**
 * DQSS 값의 출처. 5 가드 §5 Glass-box — 시드/데모 점수를 실측 품질점수처럼 보여주지 않는다.
 * 'seed' = 손으로 채운 데모값 · 'measured' = DQSS 파이프라인 5개 성분 전부 실측 산출 ·
 * 'partial' = 일부 성분만 실측(나머지는 unavailable) — 등급은 표시하되 PARTIAL 태그 +
 * 상세("N/5 components measured · measured weight ≤M%")를 병기한다.
 */
export type DQSSProvenance = 'seed' | 'measured' | 'partial';

/** data_quality.json 의 출처 선언 (없으면 미표기 → 배지에 아무 라벨도 붙이지 않는다) */
export interface DataQualityMeta {
  source: DQSSProvenance;
  generated_at?: string;
  note?: string;
  /** 'partial' 소스일 때 성분별 실측 여부 (예: {freshness:"measured", consistency:"unavailable-no-cross-source-pair"}). */
  inputs?: Record<string, string>;
  /** 'partial' 소스일 때 실측 성분들의 가중치 합 범위 [min, max] (%). */
  measured_weight_range?: number[];
  /** 파이프라인이 등급을 매긴 관측소 수 (forward-compat — 미선언 파일은 `stations.length`로 대체). */
  graded_stations?: number;
  /** 업스트림이 아는 전체 관측소 수 (선택 — `graded_stations` 없이는 무의미). */
  total_stations?: number;
}

/** Response shape of data_quality.json */
export interface DataQualityResponse {
  meta?: DataQualityMeta;
  stations: DQSSStation[];
}

// ── Earth Visualization Types (Nullschool + IQAir Clone) ──

/** Data category mode — determines available overlays and data sources */
export type DataMode = 'air' | 'ocean' | 'chemistry' | 'particulates' | 'astronomy' | 'biology' | 'policy';


/** Map projection type for globe rendering */
export type ProjectionType =
  | 'orthographic'
  | 'equirectangular'
  | 'stereographic'
  | 'conicEquidistant'
  | 'patterson'
  | 'winkelBurg'
  | 'winkelTripel'
  | 'atlantis'
  | 'waterman';

/** Visualization sub-mode within a data mode */
export type VisualizationType = 'wind' | 'oceanCurrents' | 'waves';

/** View mode for citizen vs expert UX */
export type ViewMode = 'citizen' | 'expert';

/** Mutually exclusive visualization mode for primary data layer */
export type VisualizationMode = 'heatmap' | 'spikes' | 'dotmap' | 'none';

/** Active panel (only one at a time) */
export type ActivePanel = 'station' | 'country' | 'sdid' | 'forecast' | 'ranking' | null;

/** Grid cell hover readout (Globe stage tooltip) */
export interface GridHoverInfo {
  lat: number;
  lon: number;
  /** Sampled cell value — null = 측정되지 않음 (정직 empty) */
  value: number | null;
}

/** Overlay picker category key (Globe dashboard) */
export type OverlayCategoryKey = 'aq' | 'weather' | 'ocean' | 'pollen';

/** Overlay picker category definition (Globe dashboard — lib/config/globeOverlays.ts) */
export interface OverlayCategoryDef {
  readonly key: OverlayCategoryKey;
  readonly ko: string;
  readonly en: string;
  readonly overlays: readonly OverlayType[];
}

/** Overlay color scale stop for gradient rendering */
export interface OverlayColorStop {
  value: number;
  color: [number, number, number]; // RGB 0-255
  label?: string;
}

/** Overlay color scale configuration */
export interface OverlayColorScaleConfig {
  name: string;
  unit: string;
  stops: OverlayColorStop[];
}


/** Pressure level metadata for Open-Meteo API mapping */
export interface PressureLevelMeta {
  label: string;
  hPa: number | null; // null for surface
  openMeteoParam: string;
}

/** Data mode configuration — available overlays per mode */
export interface DataModeConfig {
  label: string;
  overlays: OverlayType[];
  visualizations: VisualizationType[];
  description: string;
}

/** Props for Nullschool control panel */
export interface NullschoolPanelProps {
  onLocate?: () => void;
  locating?: boolean;
}

/** PM2.5 / pollen color scale segments: [threshold, [R, G, B]] */
export type ColorSegments = ReadonlyArray<readonly [number, readonly [number, number, number]]>;

/** Globe data mode selector option */
export interface ModeOption {
  readonly mode: DataMode;
  readonly label: string;
  readonly defaultOverlay: OverlayType;
}

/** Per-mode layer option for the layer toggle panel */
export interface LayerOption {
  readonly key: OverlayType;
  readonly label: string;
  readonly unit: string;
}

// ── Globe Visual Preset & HUD Style ──

/** Visual theme preset for Three.js globe renderer */
export type NullschoolThemePreset = 'nullschool' | 'windy' | 'wireframe';

/** HUD rendering style — nullschool (inline text) vs glass (pill buttons) */
export type HUDStyle = 'nullschool' | 'glass';

/** Earth rendering style — photo texture, line outlines, or point cloud */
export type EarthStyle = 'photo' | 'outline' | 'pointcloud';

/** AQ data source — Open-Meteo (free, grid) vs Google (paid, 500m grid) */
export type AQDataSource = 'open-meteo' | 'google';

// ── Fire Hotspot (NASA FIRMS) ──

/** Single fire detection point from NASA FIRMS */
export interface FireHotspot {
  lat: number;
  lon: number;
  brightness: number | null;
  frp: number | null;
  date: string | null;
  confidence: string | null;
}

/** Response from FIRMS data-proxy handler */
export interface FirmsResponse {
  fires: FireHotspot[];
  count: number;
  source: string;
  area: string;
  dayRange: number;
  /** 발행 시각 (ISO). 정적 발행물(`collect_firms.py`)만 싣는다 — 프록시 응답엔 없다. */
  refTime?: string;
  /** 상류 탐지 총량. `count` 보다 크면 발행 단계에서 잘렸다는 뜻. */
  totalDetections?: number;
  /** 발행이 FRP 상위 N 건으로 잘렸는지 (`collect_firms.py` MAX_PUBLISHED). */
  capped?: boolean;
  /** 잘렸을 때 발행분의 최저 FRP. 안 잘렸으면 발행물이 null 로 싣는다. */
  minFrpPublished?: number | null;
}

/**
 * 화재 레이어가 실제로 보여주는 양 — 절단은 3단이라 한 숫자로 요약할 수 없다.
 *
 *   탐지(detected) → 발행(published, 버킷 5MB + 전송량) → 렌더(rendered, 인스턴스 메시 용량)
 *
 * 발행물은 절단을 정직하게 싣는데(`totalDetections`/`capped`/`minFrpPublished`)
 * 화면이 읽지 않아 "전지구 활성 화재" 로 보였다. 이 타입이 그 간극을 잇는다.
 */
export interface FireCoverage {
  /** 인스턴스 메시로 실제 그려진 점 수 (`MAX_FIRES` 상한 적용 후). */
  rendered: number;
  /** 발행물이 담은 점 수. */
  published: number;
  /** 상류 탐지 총량. 발행물에 필드가 없으면 null — 0 으로 갈음하지 않는다. */
  detected: number | null;
  /** 발행 단계에서 잘렸는지. */
  capped: boolean;
  /** 잘렸을 때 발행 최저 FRP. 그 외 null. */
  minFrpPublished: number | null;
  /** 발행 시각 (ISO). 없으면 null. */
  refTime: string | null;
  /**
   * 피드를 읽은 시점 기준 발행 나이(시간). 파싱 불가·미래 시각이면 null.
   * 렌더가 아니라 로드 시점에 재기 때문에 긴 세션에서는 실제보다 어리다.
   */
  ageHours: number | null;
  /**
   * 나이가 수집 SLA(`FIRE_FRESHNESS_SLA_H`)를 넘었는지 = 이 피드는 "현재" 가 아니다.
   *
   * 나이를 *숫자로* 보여주는 것만으로는 부족했다 — 203시간과 3시간이 같은 dim 으로
   * 나와서 정지한 파이프라인이 화면에서 정상처럼 읽혔다. 판정을 값으로 만들어
   * 호출부가 서술을 바꾸게 한다. 나이를 모르면(`ageHours === null`) false —
   * 모르는 것을 고장으로 단정하지 않는다.
   */
  stale: boolean;
}

// ── Climate TRACE Emissions ──

/** Single emission facility from Climate TRACE */
export interface EmissionFacility {
  lat: number;
  lon: number;
  name: string;
  sector: string;
  country: string;
  emissions_co2e: number;
  unit: string;
}

/** Response from Climate TRACE collection */
export interface ClimateTraceResponse {
  refTime: string;
  source: string;
  sectors: string[];
  count: number;
  facilities: EmissionFacility[];
}

// ── Health Impact (GBD/IHME) ──

/** Country-level health impact from air pollution */
export interface HealthImpact {
  country: string;
  iso3: string;
  year: number;
  deaths: number;
  dalys: number;
  pm25_exposure: number;
  population: number;
}

/** Response from GBD health data collection */
export interface HealthImpactResponse {
  refTime: string;
  source: string;
  count: number;
  data: HealthImpact[];
}

// ── Population Density (WorldPop) ──

/** Population grid point (downsampled) */
export interface PopulationGridPoint {
  lat: number;
  lon: number;
  population: number;
}

/** Response from WorldPop collection */
export interface PopulationGridResponse {
  refTime: string;
  source: string;
  resolution: number;
  count: number;
  points: PopulationGridPoint[];
}

// ── XAI Overlay ──

export interface XAIOverlayData {
  /** Station or prediction ID */
  targetId: string;
  /** Top contributing features with SHAP values */
  features: Array<{
    name: string;
    contribution: number;
    direction: 'positive' | 'negative';
  }>;
  /** Base prediction value before feature contributions */
  baseValue: number;
  /** Model version that produced the explanation */
  modelVersion: string;
}

// ── Pollen Particle (Phase 3 — PollenParticles layer) ──

export interface PollenParticle {
  lat: number;
  lon: number;
  age: number;
  phase: number;
  concentrationNorm: number;
  /** Cached instance tint (THREE hex) from POLLEN_COLOR_SCALE at spawn concentration. */
  colorHex: number;
}

// ── Globe Page Types ──

export type LayerKey = 'wind' | 'stations' | 'arcs' | 'grid' | 'fires' | 'choropleth';

export interface GlobeSection {
  key: string;
  ko: string;
  en: string;
  desc_ko: string;
  desc_en: string;
  layers: Record<LayerKey, boolean>;
  overlay?: string;
}

export interface TierDef {
  color: string;
  koKey: string;
  koDefault: string;
}

export interface StationData {
  lat: number;
  lon: number;
  pm25: number;
  name: string;
  position: import('three').Vector3;
  isSatellite: boolean;
  source?: string;
  sensorType?: string;
  p10?: number;
  p90?: number;
  stationUid?: string;
}

/**
 * 자체 ML 예측 마커 (grid_latest.json → 지구본). 관측소(StationData)와 별개 타입 —
 * 예측을 실측처럼 섞지 않는다(§5 Glass-box). p50 = 중앙 추정, p10/p90 = 80% 명목 구간.
 */
export interface PredictionMarker {
  name: string;
  lat: number;
  lon: number;
  /** 중앙 예측 (median, µg/m³). */
  p50: number;
  p10: number;
  p90: number;
  position: import('three').Vector3;
  source?: string;
  modelVersion?: string;
  /** 병치 관측(있으면) — 예측 검증용 참고값. */
  observedPm25?: number | null;
  /** 예측 신뢰 등급(A–F). 센서 DQSS와 다른 quantity — null = 산정 불가/fallback. */
  confidenceGrade?: string | null;
}

/**
 * 선택된 자체-ML 예측 (지구본 예측 마커 클릭). 관측소(SelectedStation)와 분리된 슬롯 —
 * 두 레이어의 pointer 리스너가 서로의 null 을 덮어쓰지 않게 하고, 예측을 실측처럼
 * 표기하지 않기 위함(§5 Glass-box). DQSS 없음(예측엔 실측 품질점수 부재 → "DQSS —").
 */
export interface SelectedPrediction {
  name: string;
  lat: number;
  lon: number;
  /** 중앙 예측 (median, µg/m³). */
  p50: number;
  p10: number;
  p90: number;
  source?: string;
  modelVersion?: string;
  observedPm25?: number | null;
  /** 예측 신뢰 등급(A–F). 센서 DQSS와 다른 quantity — null = 산정 불가/fallback. */
  confidenceGrade?: string | null;
}

/** 호버된 예측 마커 (툴팁용 경량 슬롯). */
export interface HoveredPrediction {
  name: string;
  lat: number;
  lon: number;
  p50: number;
  p10: number;
  p90: number;
  /** 예측 신뢰 등급(A–F). 센서 DQSS와 다른 quantity — null = 산정 불가/fallback. */
  confidenceGrade?: string | null;
}

// ── Global Grid Snapshot (api/gridSnapshot.ts, re-exported by api/globalGrid.ts) ──

// DQSS letter grade — numeric score 0-100 → 5 grade (A>=90, B>=80, C>=70, D>=60, F).
// 5 가드 §5 Glass-box 정합 — 모든 ML 출력 컴포넌트 배지 의무.
export type DQSSGrade = 'A' | 'B' | 'C' | 'D' | 'F';


// ── DQSS Score Lookup Cache (hooks/useGlobeData.ts) ──
// DQSSStation 재사용 — 위 line 168-180 정의 (badge / freshness / completeness 등 풍부 schema).

export type DQSSScoreMap = Map<string, number>;

/**
 * `'partial'` provenance 의 파생 상세 — `data_quality.json` 의 `meta.inputs` /
 * `meta.measured_weight_range` 에서 계산한다 (문구 하드코딩 아님). 파생 불가하면
 * `DQSSCache.partialDetail`이 null — 그때는 배지에 PARTIAL 태그만 붙고 상세 문구는 생략.
 */
export interface DQSSPartialDetail {
  /** 실측('measured')으로 선언된 성분 개수 */
  measured: number;
  /** 선언된 성분 총 개수 */
  total: number;
  /** 실측 성분들의 가중치 합 상한 (%) */
  measuredWeightMax: number;
}

/**
 * 관측소 카운트 — `meta.graded_stations`/`total_stations`가 선언되어 있으면 그 값,
 * 아니면 `DQSSCache.stations.length`(이미 finite `final_score`만 필터된 배열)로
 * 대체한다. `declared: false` 는 그 대체 경로를 탔다는 표시 — G8 신뢰도 스트립이
 * 툴팁 문구를 다르게 고른다 (선언값 vs 파생값을 같은 문장으로 뭉개지 않는다).
 */
export interface DQSSStationCounts {
  graded: number;
  total: number | null;
  declared: boolean;
}

export interface DQSSCache {
  map: DQSSScoreMap;
  stations: DQSSStation[];
  /** 파일이 선언한 출처. 선언 없으면 null — 라벨을 지어내지 않는다. */
  provenance: DQSSProvenance | null;
  /** 'partial' 일 때만 값 존재 — 그 외에는 null. */
  partialDetail: DQSSPartialDetail | null;
  /** 항상 값 존재 — 관측소가 0개여도 `{graded: 0, total: null, declared: false}`. */
  stationCounts: DQSSStationCounts;
}

// ── IDW Heatmap Worker (Globe P4a — three/systems/idwCore.ts) ──

/** IDW heatmap — station sample point (idwCore) */
export interface IdwStationPt {
  lat: number;
  lon: number;
  value: number;
}

/** IDW heatmap — tunable parameters passed into the pure core */
export interface IdwParams {
  power: number;
  maxDistDeg: number;
  alphaMax: number;
  alphaBase: number;
  alphaDivisor: number;
  /**
   * Observation-density confidence decay. The core measures how far a cell sits
   * from the data behind it (IDW-weighted mean distance, degrees) and fades cells
   * that rest on distant observations. Required, not optional — a default inside
   * the worker-importable core would be a hardcoded constant (core-rules §3-1).
   * Values come from GLOBE_CONFIG.GLOBE_HEATMAP.
   */
  /** At or below this weighted mean distance there is no decay (factor 1). */
  densityFullDeg: number;
  /** At or above this distance the decay saturates. Clamped to maxDistDeg. */
  densityFadeDeg: number;
  /** Floor for the decay factor — a sparse cell fades but never vanishes. */
  densityAlphaMin: number;
}

/** IDW worker request/response envelope (token = stale-drop 세대 식별) */
export interface IdwRequest {
  token: number;
  stations: IdwStationPt[];
  scale: ColorSegments;
  w: number;
  h: number;
  params: IdwParams;
}

export interface IdwResponse {
  token: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

// ── Policy Choropleth (Globe P5b — build-time index from policy-registry) ──

/** One country's entry in the build-time policy choropleth index. */
export interface PolicyChoroplethEntry {
  name: string;
  region: string;
  totalPolicies: number;
  /** PM2.5 annual standard ÷ WHO guideline — null = country has no such standard on file. */
  pm25AnnualRatio: number | null;
  /** PM2.5 annual standard value (µg/m³) — null = country has no such standard on file. */
  pm25AnnualValue: number | null;
}

/** public/data/policy-registry/choropleth.json — keyed by ISO alpha-2 (uppercase). */
export interface PolicyChoroplethIndex {
  metric: string;
  countries: Record<string, PolicyChoroplethEntry>;
}

// ── Wind altitude (Globe P1 — the levels we actually collect) ──


/** unavailable = no data at this level (render nothing). stale = older than the SLA. */
export type WindFieldStatus = 'loading' | 'ready' | 'stale' | 'unavailable';

// ── Renderer capabilities (Globe P0 — field measurement for the P3 fallback chain) ──

/** What the visitor's GPU actually supports, as probed by detectGlobeCapabilities(). */
export interface GlobeCapabilities {
  webgl: boolean;
  /** three r184 has no WebGL1 renderer — false means the 2D fallback renders. */
  webgl2: boolean;
  /** OES_texture_float_linear — LinearFilter sampling of the FloatType wind texture. */
  floatLinear: boolean;
  /** EXT_color_buffer_float (webgl1: WEBGL_color_buffer_float) — render-to-float, the P3 GPU-compute gate. */
  floatColorBuffer: boolean;
  maxTextureSize: number;
}

// ── Wind/pollution particle paths (Globe P3 — GPU compute + CPU fallback) ──

/** A pollution proximity source (marker AQI or fire hotspot), shared by the CPU and GPU particle paths. */
export interface PollutionSource {
  lat: number;
  lon: number;
  pm25: number;
}

/** Handle returned by createGpuParticleSystem() — GPUComputationRenderer ping-pong advection + ring-buffer trails. */
export interface GpuParticleSystem {
  /** Advances the position compute pass one frame. `advectionDeltaFactor` = deltaFactor(frame delta) — 1.0 at 60fps. */
  compute: (elapsedSeconds: number, advectionDeltaFactor: number) => void;
  /** Blits the current head position texture into the next ring slot. Call after compute(). */
  pushRing: () => void;
  /** Current ring texture at slot `i` (0..ringSize-1). */
  getRingTexture: (i: number) => THREE.Texture;
  /** Current head slot index (0..ringSize-1) — matches the `uHead` uniform the vertex shader expects. */
  headIndex: () => number;
  /** Swaps the wind DataTexture the compute shader samples (cheap uniform assignment, not a texture rebuild). */
  setWindTexture: (tex: THREE.Texture | null) => void;
  texSize: number;
  ringSize: number;
  dispose: () => void;
}
