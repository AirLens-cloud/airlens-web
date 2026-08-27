/**
 * globeOntology — 지구본이 그리는 "무엇"의 단일 정본 (SOT).
 *
 * 계층 1 현상(Phenomenon) · 계층 3 인식론(Provenance) · 파이프라인(경로·주기·해상도·신선도)
 * · 시각(색 스케일·범례 눈금·HUD 라벨)을 한 곳에서 선언하고, **다른 모듈이 여기서 읽어간다**.
 * 계층 4 시각 문법(nature → 색역할/모션/불확실성)은 globeVizGrammar.ts 가 소유하고,
 * 본 모듈의 LAYERS 가 레이어별로 그 문법을 *해소*한다.
 *
 * 왜 선언만으로 부족한가: 직전 vizGrammar 는 계약 문서일 뿐 어떤 레이어도 읽지 않아
 * (테스트 외 import 0건) 드리프트를 못 막았다. 그래서 본 모듈은 **파생 SOT** 다 —
 * OVERLAY_SCALE_MAP · COLOR_BAR_CONFIGS · OVERLAY_DISPLAY_LABELS · 오버레이 fetch 경로 ·
 * 바람 레벨·신선도 SLA 가 전부 여기서 파생된다. 값을 여기서 바꾸면 렌더·범례·HUD·수집 경로가
 * 함께 움직이고, 여기 없으면 어디에도 없다.
 *
 * 정직성 계약:
 * - `pipeline: null` = 수집 경로 없음 → 피커·범례 노출 금지 (골랐는데 빈 화면인 상태 원천 차단).
 * - `legend` 없음 = 격자 렌더 불가 (스케일 없이 색을 지어내지 않는다).
 * - `freshnessSlaH` 초과 = stale 표시 (가짜 최신 금지). null = 신선도 계약 미정의(측정 안 함).
 * - 색 hex 자체는 스케일 배열(earth/config)이 소유하고, 본 모듈은 *어떤 스케일인지*만 가리킨다.
 */
import type { OverlayType } from '../../types/globe';
import type { ColorSegments, DQSSGrade, PressureLevel, WindLevel } from '../../types/globe';
import {
  PM25_COLOR_SCALE, PM10_COLOR_SCALE, TEMP_COLOR_SCALE, RH_COLOR_SCALE,
  NO2_COLOR_SCALE, O3_COLOR_SCALE, CO_COLOR_SCALE,
  SST_COLOR_SCALE, SSTA_COLOR_SCALE, WAVES_COLOR_SCALE, CURRENTS_COLOR_SCALE,
  POLLEN_COLOR_SCALE, POLICY_CHOROPLETH_SCALE, WIND_SPEED_RAMP,
} from '../earth/config';
import { GRAMMAR, type DataNature, type MotionKind, type UncertaintyKind, type VizChannelContract } from './globeVizGrammar';
import { VIZ_ACCENT_HEX } from './viz';

// ── 계층 3: 인식론 ───────────────────────────────────────────────────────────

/** 이 현상이 가질 수 있는 인식론적 출처 (Glass-box 의 온톨로지화). */
export type ProvenanceKind =
  | 'observed' // 관측소 실측
  | 'interpolated' // 격자 보간 (IDW / 재분석 격자 샘플)
  | 'model-forecast' // 수치모델 예보 (GFS / GEFS / CAMS)
  | 'satellite-derived' // 위성 추정 (MAIAC AOD → PM2.5, FIRMS FRP)
  | 'inferred'; // 인과·유도 추정 (SDID, 연기 이송)

export type TimeAxis = 'current' | 'forecast' | 'historical';

/**
 * 센서/격자 DQSS 점수(0-100) → A–F 등급. **인식론 계층의 단독 정본.**
 *
 * 왜 여기인가: 직전엔 같은 점수를 세 곳이 서로 다른 컷오프로 읽어(격자 ≥90/80/70/60,
 * 관측소 패널 ≥90/75/60/45, 툴팁 3단 ≥75/≥50) 82점이 화면에 따라 A 도 B 도 됐다. 등급은
 * "이 값을 얼마나 믿는가"의 진술이므로 현상·출처와 같은 곳에서 한 번만 정의돼야 한다.
 *
 * 경계 근거 = **생산자**(`models/models/dqss/rule_based_dqss.py` `QualityBadge`)가 정의한
 * 4등급 — High ≥80 / Medium ≥50 / Low ≥20 / Unreliable <20. 그 셋(80·50·20)을 그대로 앵커로
 * 쓰고, UI 가 요구하는 5등급(WEB_PRD §5.9)을 맞추기 위해 Medium 구간을 B|C 로 나누는 65
 * 하나만 신설했다. 즉 생산자가 "High" 라 판정한 82점은 반드시 A 이고, "Unreliable" 은 F 다 —
 * 생산자 판단을 등급이 뒤집지 않는다. (A–F 숫자표는 이전까지 코드·문서 어디에도 없었다.)
 *
 * 주의: `policy_results.dqss_score` 는 **다른 양**이다 (SDID 패널 적합도 —
 * `score_policy_data()`: 관측소 밀도/기간 커버리지/출처/평행추세/강건성). 이름이 같을 뿐이라
 * 본 함수로 변환하지 않는다 — `api/policy.ts` 의 `policyDataQualityToGrade` 참조.
 */
export const DQSS_GRADE_CUTOFFS: readonly (readonly [number, DQSSGrade])[] = [
  [80, 'A'], // 생산자 High
  [65, 'B'], // 생산자 Medium 상단 (B|C 분할선 — 유일한 신설 경계)
  [50, 'C'], // 생산자 Medium 하단
  [20, 'D'], // 생산자 Low
];

/** 점수 → 등급. 점수가 없으면 등급도 없다 (`null` — 모르는 것을 C 로 채우지 않는다). */
export function dqssScoreToGrade(score: number | null | undefined): DQSSGrade | null {
  if (score == null || !Number.isFinite(score)) return null;
  for (const [floor, grade] of DQSS_GRADE_CUTOFFS) {
    if (score >= floor) return grade;
  }
  return 'F'; // 생산자 Unreliable
}

// ── 파이프라인 ───────────────────────────────────────────────────────────────

/** 피드 = 하나의 수집 산출물. 오버레이 여럿이 한 피드를 공유한다. */
export type FeedKind =
  | 'aq-grid' // 오염물질 격자 (Open-Meteo AQ)
  | 'weather-grid' // 기상 격자
  | 'marine-grid' // 해양 격자
  | 'pollen-grid' // 꽃가루 격자 (CAMS, 유럽 한정)
  | 'wind-grid' // 바람 벡터장 (NOAA GFS, 레벨별)
  | 'fire-points' // 화재 hotspot (NASA FIRMS)
  | 'city-predictions' // 자체 ML 도시 PM2.5 예측 (grid_latest.json)
  | 'policy-registry'; // 국가 대기질 기준 (정적 사실)

export interface PhenomenonPipeline {
  readonly feed: FeedKind;
  /** 피드 payload 안에서 이 현상이 차지하는 키 (없으면 피드 전체가 곧 이 현상). */
  readonly varKey?: string;
  /**
   * 사전 수집 피드의 오브젝트 경로 (1순위) — HF 공개 dataset repo
   * (`Robeedau/airlens-live`, `HF_LIVE_BASE`)에 이 경로 그대로 붙는다. 필드명은
   * 옛 Supabase Storage 버킷 경로에서 유래(402 migration, plan:
   * supabase-polymorphic-abelson) — repo 레이아웃이 버킷을 그대로 미러링해
   * 경로 문자열 자체는 안 바뀌었다.
   */
  readonly storagePath?: string;
  /**
   * CDN 폴백 경로 — `SNAPSHOT_CDN_BASE`(mac GitHub Pages 무료 발행)에 붙는 상대경로
   * (2순위, Storage 다음·정적 폴백 이전. R-W1). Storage/Edge 가 quota 로 죽어도
   * `mac-data-publish.yml` 이 매시간 계속 발행하는 스냅샷으로 대체한다.
   */
  readonly cdnPath?: string;
  /** 정적 폴백 경로 (`public/`). */
  readonly staticPath?: string;
  readonly source: string;
  readonly cadence: string;
  readonly resolution: string;
  /** 이 나이를 넘기면 stale. null = 신선도 계약 미정의 (현재 측정 안 함 — 정직 표기). */
  readonly freshnessSlaH: number | null;
  /** 커버리지 한계. 전지구가 아니면 반드시 명시 — 빈 화면이 버그로 오해되지 않게. */
  readonly coverage?: string;
}

// ── 계층 1: 현상 ─────────────────────────────────────────────────────────────

/** 오버레이로 고를 수 있는 현상 + 오버레이가 아닌 현상(화재/연기/이송/규제기준). */
export type PhenomenonId =
  | Exclude<OverlayType, 'none'>
  | 'fire' | 'smoke' | 'transport' | 'policy-standard' | 'pm25-prediction';

/** HUD(범례·툴팁·레이어 카드)에서 이 현상을 부르는 이름. 없으면 사용자 노출 불가. */
export interface HudDef {
  readonly label: string;
  readonly unit: string;
  readonly color: string;
}

/** 격자/범례 램프. 없으면 스칼라필드 렌더 불가. */
export interface LegendDef {
  readonly colorScale: ColorSegments;
  readonly ticks: readonly string[];
}

export interface PhenomenonDef {
  readonly provenance: readonly ProvenanceKind[];
  readonly verticalLevels: readonly PressureLevel[];
  readonly timeAxes: readonly TimeAxis[];
  readonly pipeline: PhenomenonPipeline | null;
  readonly hud?: HudDef;
  readonly legend?: LegendDef;
  /** 예보 축이 별도 피드로 존재할 때 (PM2.5 GEFS 타임라인). */
  readonly forecastPipeline?: PhenomenonPipeline;
}

const SURFACE: readonly PressureLevel[] = ['surface'];
const NOW: readonly TimeAxis[] = ['current'];

/** WHO/IQAir PM2.5 등급 경계 — pm25 범례 눈금. */
const AQ_MARKS: readonly string[] = ['0', '12', '35', '55', '150', '250'];
/** US EPA 24h PM10 등급 경계 — pm10 전용 (PM2.5 경계 재사용 금지: 같은 등급이 ~2-4× 농도). */
const PM10_MARKS: readonly string[] = ['0', '54', '154', '254', '354', '424'];
const POLLEN_MARKS: readonly string[] = ['0', '30', '100', '300'];

/** data-collect-hourly.yml cron = 3시간. 격자 피드 4종이 같은 주기를 공유한다. */
const CADENCE_3H = '3h';

/** Open-Meteo AQ 격자 — 수집 스텝(AQ_STEP=5)·경로는 워크플로 실측치. */
/**
 * mac GEFS-chem 발행이 실제로 커버하는 오염물질(pm25/pm10) — GEFS-Aerosols 는 가스를
 * 주지 않는다(`collect_gefs_chem_global.py` `EXPECTED_POLLUTANT_COUNT=2`). o3/no2/co 는
 * CDN 경로 없음(cdnPath undefined) — Storage → 정적 폴백 2단 체인 그대로.
 */
const CDN_COVERED_AQ_IDS: readonly string[] = ['pm25', 'pm10'];

const aqPipeline = (id: 'pm25' | 'pm10' | 'o3' | 'no2' | 'co', varKey: string): PhenomenonPipeline => ({
  feed: 'aq-grid',
  varKey,
  storagePath: `aq-data/current-${id}-grid.json`,
  cdnPath: CDN_COVERED_AQ_IDS.includes(id) ? `current-${id}-grid.json` : undefined,
  staticPath: `/data/current-${id}-grid.json`,
  source: 'Open-Meteo Air Quality',
  cadence: CADENCE_3H,
  resolution: '5°',
  freshnessSlaH: null,
});

/** 기상 격자 (STEP=10, 위도 −80…80). */
const weatherPipeline = (varKey: string): PhenomenonPipeline => ({
  feed: 'weather-grid',
  varKey,
  storagePath: 'wind-data/weather-grid.json',
  staticPath: '/data/weather/current/weather-grid.json',
  source: 'Open-Meteo Weather',
  cadence: CADENCE_3H,
  resolution: '10°',
  freshnessSlaH: null,
});

/** 해양 격자 (MARINE_STEP=10, 위도 −60…60). */
const marinePipeline = (varKey: string): PhenomenonPipeline => ({
  feed: 'marine-grid',
  varKey,
  storagePath: 'wind-data/marine-data.json',
  staticPath: '/data/weather/current/marine-data.json',
  source: 'Open-Meteo Marine',
  cadence: CADENCE_3H,
  resolution: '10°',
  freshnessSlaH: null,
  coverage: '위도 −60…60',
});

/** 꽃가루 격자 (POLLEN_STEP=2, 유럽 bbox 34…72N / −12…45E). */
const pollenPipeline = (varKey: string): PhenomenonPipeline => ({
  feed: 'pollen-grid',
  varKey,
  storagePath: 'aq-data/pollen-grid.json',
  staticPath: '/data/pollen-grid.json',
  source: 'Open-Meteo CAMS pollen',
  cadence: CADENCE_3H,
  resolution: '2°',
  freshnessSlaH: null,
  coverage: '유럽 한정 (CAMS 도메인) — 도메인 밖은 격자가 비어 아무것도 안 그려진다',
});

/** 라벨만 있고 수집 경로가 없는 현상 — 피커 비노출. */
const declaredOnly = (hud: HudDef): PhenomenonDef => ({
  provenance: ['interpolated'],
  verticalLevels: SURFACE,
  timeAxes: NOW,
  pipeline: null,
  hud,
});

/**
 * 현상 레지스트리 — 지구본이 아는 모든 것.
 *
 * hud/legend/pipeline 값은 직전 SOT(earth/config 의 COLOR_BAR_CONFIGS·OVERLAY_DISPLAY_LABELS,
 * api/airQualityGrid 의 경로맵)에서 **그대로** 이관했다. P2 게이트 = 렌더 결과 불변.
 */
export const PHENOMENA: Readonly<Record<PhenomenonId, PhenomenonDef>> = {
  // ── 오염물질 ──
  pm25: {
    provenance: ['interpolated', 'observed', 'model-forecast'],
    verticalLevels: SURFACE,
    timeAxes: ['current', 'forecast'],
    pipeline: aqPipeline('pm25', 'pm2_5'),
    forecastPipeline: {
      feed: 'aq-grid',
      storagePath: 'aq-data/timeline/manifest.json',
      source: 'NOAA GEFS-Aerosols',
      cadence: '6h',
      resolution: '2°',
      freshnessSlaH: 12,
      coverage: '±24h @ 3h. 단일 결정론 멤버 — p10-p90 미제공 (밴드 조작 금지, caveat 로 대체)',
    },
    hud: { label: 'PM2.5', unit: 'µg/m³', color: '#10b981' },
    legend: { colorScale: PM25_COLOR_SCALE, ticks: AQ_MARKS },
  },
  pm10: {
    provenance: ['interpolated', 'observed'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: aqPipeline('pm10', 'pm10'),
    hud: { label: 'PM10', unit: 'µg/m³', color: '#34d399' },
    legend: { colorScale: PM10_COLOR_SCALE, ticks: PM10_MARKS },
  },
  o3: {
    provenance: ['interpolated'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: aqPipeline('o3', 'ozone'),
    hud: { label: 'Ozone', unit: 'ppb', color: '#a855f7' },
    legend: { colorScale: O3_COLOR_SCALE, ticks: ['0', '30', '60', '90', '120', '200'] },
  },
  no2: {
    provenance: ['interpolated'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: aqPipeline('no2', 'nitrogen_dioxide'),
    hud: { label: 'NO₂', unit: 'ppb', color: '#f97316' },
    legend: { colorScale: NO2_COLOR_SCALE, ticks: ['0', '5', '15', '30', '50', '80', '120'] },
  },
  co: {
    provenance: ['interpolated'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: aqPipeline('co', 'carbon_monoxide'),
    hud: { label: 'CO', unit: 'µg/m³', color: '#78716c' },
    legend: { colorScale: CO_COLOR_SCALE, ticks: ['0', '50', '100', '200', '350', '500'] },
  },
  so2: declaredOnly({ label: 'SO₂', unit: 'ppb', color: '#ec4899' }),

  // ── 기상 ──
  wind: {
    provenance: ['model-forecast'],
    verticalLevels: ['surface', '850hPa'],
    timeAxes: NOW,
    pipeline: {
      feed: 'wind-grid',
      source: 'NOAA/NCEP GFS',
      cadence: CADENCE_3H,
      resolution: '1° (Storage) / 2° (정적 폴백)',
      freshnessSlaH: 6,
    },
    hud: { label: 'Wind Speed', unit: 'm/s', color: '#00b0dc' },
    legend: { colorScale: WIND_SPEED_RAMP, ticks: ['0', '5', '10', '20', '30', '40'] },
  },
  temp: {
    provenance: ['interpolated'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: weatherPipeline('temp'),
    hud: { label: 'Temperature', unit: '°C', color: '#f59e0b' },
    legend: { colorScale: TEMP_COLOR_SCALE, ticks: ['-40', '-20', '0', '10', '20', '30', '40'] },
  },
  rh: {
    provenance: ['interpolated'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: weatherPipeline('rh'),
    hud: { label: 'Humidity', unit: '%', color: '#3b82f6' },
    legend: { colorScale: RH_COLOR_SCALE, ticks: ['0', '25', '50', '75', '100'] },
  },
  // 아래 4종 — 피드는 있으나 색 스케일이 없다 → 격자 렌더 불가 (피커 비노출).
  precip: {
    provenance: ['interpolated'], verticalLevels: SURFACE, timeAxes: NOW,
    pipeline: weatherPipeline('precip'),
    hud: { label: 'Precipitation', unit: 'mm', color: '#2563eb' },
  },
  cloud: {
    provenance: ['interpolated'], verticalLevels: SURFACE, timeAxes: NOW,
    pipeline: weatherPipeline('cloud'),
    hud: { label: 'Cloud Cover', unit: '%', color: '#cbd5e1' },
  },
  uvi: {
    provenance: ['interpolated'], verticalLevels: SURFACE, timeAxes: NOW,
    pipeline: weatherPipeline('uvi'),
    hud: { label: 'UV Index', unit: '', color: '#eab308' },
  },
  mslp: {
    provenance: ['interpolated'], verticalLevels: SURFACE, timeAxes: NOW,
    pipeline: weatherPipeline('mslp'),
    hud: { label: 'Pressure', unit: 'hPa', color: '#a3a3a3' },
  },

  // ── 해양 ──
  sst: {
    provenance: ['interpolated'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: marinePipeline('sst'),
    hud: { label: 'Sea Surface Temp', unit: '°C', color: '#0891b2' },
    legend: { colorScale: SST_COLOR_SCALE, ticks: ['0', '8', '16', '24', '32'] },
  },
  ssta: {
    provenance: ['interpolated'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: marinePipeline('sst'), // SSTA = SST − 기후평년값
    hud: { label: 'SST Anomaly', unit: '°C Δ', color: '#dc2626' },
    legend: { colorScale: SSTA_COLOR_SCALE, ticks: ['-3', '-1', '0', '+1', '+3'] },
  },
  waves: {
    provenance: ['interpolated'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: marinePipeline('waves'),
    hud: { label: 'Wave Height', unit: 'm', color: '#0ea5e9' },
    legend: { colorScale: WAVES_COLOR_SCALE, ticks: ['0', '1', '2', '4', '6', '10'] },
  },
  currents: {
    provenance: ['interpolated'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: marinePipeline('current_vel'),
    hud: { label: 'Ocean Currents', unit: 'm/s', color: '#14b8a6' },
    legend: { colorScale: CURRENTS_COLOR_SCALE, ticks: ['0', '0.3', '0.8', '1.5', '3', '5', '8'] },
  },

  // ── 꽃가루 (CAMS, 유럽 한정) ──
  pollen_grass: {
    provenance: ['model-forecast'], verticalLevels: SURFACE, timeAxes: NOW,
    pipeline: pollenPipeline('grass'),
    hud: { label: 'Grass Pollen', unit: 'grains/m³', color: '#b8d230' },
    legend: { colorScale: POLLEN_COLOR_SCALE, ticks: POLLEN_MARKS },
  },
  pollen_birch: {
    provenance: ['model-forecast'], verticalLevels: SURFACE, timeAxes: NOW,
    pipeline: pollenPipeline('birch'),
    hud: { label: 'Birch Pollen', unit: 'grains/m³', color: '#a3c920' },
    legend: { colorScale: POLLEN_COLOR_SCALE, ticks: POLLEN_MARKS },
  },
  pollen_alder: {
    provenance: ['model-forecast'], verticalLevels: SURFACE, timeAxes: NOW,
    pipeline: pollenPipeline('alder'),
    hud: { label: 'Alder Pollen', unit: 'grains/m³', color: '#8db820' },
    legend: { colorScale: POLLEN_COLOR_SCALE, ticks: POLLEN_MARKS },
  },
  pollen_mugwort: {
    provenance: ['model-forecast'], verticalLevels: SURFACE, timeAxes: NOW,
    pipeline: pollenPipeline('mugwort'),
    hud: { label: 'Mugwort Pollen', unit: 'grains/m³', color: '#c4a030' },
    legend: { colorScale: POLLEN_COLOR_SCALE, ticks: POLLEN_MARKS },
  },
  pollen_olive: {
    provenance: ['model-forecast'], verticalLevels: SURFACE, timeAxes: NOW,
    pipeline: pollenPipeline('olive'),
    hud: { label: 'Olive Pollen', unit: 'grains/m³', color: '#7da030' },
    legend: { colorScale: POLLEN_COLOR_SCALE, ticks: POLLEN_MARKS },
  },
  pollen_ragweed: {
    provenance: ['model-forecast'], verticalLevels: SURFACE, timeAxes: NOW,
    pipeline: pollenPipeline('ragweed'),
    hud: { label: 'Ragweed Pollen', unit: 'grains/m³', color: '#d4c020' },
    legend: { colorScale: POLLEN_COLOR_SCALE, ticks: POLLEN_MARKS },
  },

  // ── 이벤트 / 사실 (오버레이 피커 밖 — 레이어 토글로 켠다) ──
  fire: {
    provenance: ['satellite-derived'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: {
      feed: 'fire-points',
      storagePath: 'wind-data/active-fires.json',
      staticPath: '/data/fires/active-fires.json',
      source: 'NASA FIRMS (VIIRS/MODIS)',
      cadence: '6h',
      resolution: '점 관측 (VIIRS 375 m)',
      // 수집기의 SLA 와 같은 값 (`firms-collect.yml` MAX_STALENESS_HOURS=18 —
      // 6h cron 이 2회 연속 soft-skip 하는 것까지 봐주고 3회째 fail-loud).
      // 화면도 같은 계약으로 판정해야 CI 는 붉은데 UI 는 태연한 상태가 안 생긴다:
      // 2026-07-31~08-08 실제로 그 상태였다 (수집 37회 연속 실패, 피드 203h 정체,
      // HUD 는 "203시간 전" 을 3시간 전과 같은 dim 으로 표시).
      freshnessSlaH: 18,
    },
    hud: { label: 'Active Fires', unit: 'MW (FRP)', color: '#ff5a1f' },
  },
  smoke: {
    // 연기는 수집물이 아니라 화재 × 바람에서 유도되는 *이송* 표현 — 자체 피드가 없다.
    provenance: ['inferred'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: null,
    hud: { label: 'Smoke Drift', unit: '—', color: '#94a3b8' },
  },
  transport: {
    // 이송 렌즈 — 바람(flow) × 농도장(live-measure)의 결합. 연기의 형제(둘 다 파생 표현, 자체 피드 없음).
    // provenance='inferred' 라 범례가 반드시 "시각적 추정 · 화학수송모델(CTM) 아님" 을 표기한다
    // (없는 인과를 지어내지 않는다 — Glass-box). 색은 출발지 농도 = pm25 스케일에서 나온다.
    provenance: ['inferred'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: null,
    hud: { label: 'Transport Lens', unit: '—', color: VIZ_ACCENT_HEX },
  },
  'policy-standard': {
    provenance: ['observed'], // 각국 관보·규제 문서에 적힌 사실
    verticalLevels: SURFACE,
    timeAxes: ['historical'],
    pipeline: {
      feed: 'policy-registry',
      source: 'AirLens policy registry (countries.pm25_annual_standard)',
      cadence: '연 단위 개정',
      resolution: '국가',
      freshnessSlaH: null,
    },
    hud: { label: 'PM2.5 Standard', unit: '× WHO', color: '#e76f51' },
    legend: {
      colorScale: POLICY_CHOROPLETH_SCALE,
      ticks: POLICY_CHOROPLETH_SCALE.map(([threshold]) => `${threshold}×`),
    },
  },
  'pm25-prediction': {
    // 자체 ML(AODtoPM25Model v2) 도시 예측 — AOD 위성 → PM2.5, satellite-derived.
    // 'pm25'(Open-Meteo 보간 격자 + 관측 + GEFS 예보)와는 파이프라인·인식론이 다른
    // 별개 현상이다 — 같은 quantity(PM2.5)를 가리킨다고 이름을 공유하지 않는다
    // (동명이 다른 quantity 를 숨기는 사고를 회피 — feedback_shared_name_hides_different_quantity).
    provenance: ['satellite-derived'],
    verticalLevels: SURFACE,
    timeAxes: NOW,
    pipeline: {
      feed: 'city-predictions',
      staticPath: '/data/predictions/grid_latest.json',
      source: 'AirLens AODtoPM25Model v2 (자체 ML, AOD 위성 → 도시 PM2.5)',
      cadence: '수동 workflow_dispatch (cron 미활성 — C1 게이트, predictions RLS read=authenticated)',
      resolution: '도시 포인트 (현재 65개)',
      // cron 미활성 상태라 신선도 계약을 아직 못 정의한다 (측정 안 함 — 정직 표기, fabricate 금지).
      freshnessSlaH: null,
      coverage: '관측소 병치 도시 한정(65개) — 전지구 격자 아님',
    },
    hud: { label: 'ML Prediction', unit: 'µg/m³', color: '#10b981' },
  },

  // ── 선언만 — 수집 경로 없음 (라벨은 있으나 고를 수 없다) ──
  dewpoint: declaredOnly({ label: 'Dew Point', unit: '°C', color: '#6366f1' }),
  wetbulb: declaredOnly({ label: 'Wet Bulb', unit: '°C', color: '#8b5cf6' }),
  '3hpa': declaredOnly({ label: '3h Pressure Δ', unit: 'hPa', color: '#a78bfa' }),
  cape: declaredOnly({ label: 'CAPE', unit: 'J/kg', color: '#ef4444' }),
  tpw: declaredOnly({ label: 'Total Water', unit: 'kg/m²', color: '#06b6d4' }),
  tcw: declaredOnly({ label: 'Cloud Water', unit: 'kg/m²', color: '#94a3b8' }),
  wpd: declaredOnly({ label: 'Wind Power', unit: 'kW/m²', color: '#22d3ee' }),
  mi: {
    // HUD 이름조차 없던 유일한 오버레이 — 이름이 없으므로 사용자 노출 불가 (현행 유지).
    provenance: ['interpolated'], verticalLevels: SURFACE, timeAxes: NOW, pipeline: null,
  },
};

// ── 계층 4 해소: 레이어 → 현상 + 시각 문법 ────────────────────────────────────

/** Globe3DScene 이 마운트하는 데이터 레이어 (지형/베이스 제외). */
export type LayerId =
  | 'PollenParticles' | 'DataArcs' | 'AlertPulse' | 'StationLabels' | 'ScalarFieldOverlay'
  | 'FireHotspots' | 'WindParticles' | 'SmokeEmitter' | 'CountryChoropleth' | 'CountryExtrude'
  | 'PredictionMarkers';

/** 문법 기본값에서 벗어난 채널 — 사유 없이는 못 벗어난다 (침묵 드리프트 차단). */
export interface ChannelOverride {
  readonly channel: keyof VizChannelContract;
  readonly reason: string;
}

export interface LayerDef {
  /** 이 레이어가 그리는 현상. 'active-overlay' = 사용자가 고른 오버레이를 그대로 그린다. */
  readonly phenomena: readonly PhenomenonId[] | 'active-overlay';
  readonly nature: DataNature;
  readonly motion: MotionKind;
  readonly uncertainty: UncertaintyKind;
  readonly overrides?: readonly ChannelOverride[];
}

/**
 * 레이어 레지스트리. motion/uncertainty 는 **해소된 실제 값** — GRAMMAR[nature] 기본값과
 * 다르면 overrides 에 사유를 남긴다 (테스트가 강제). 직전 GRAMMAR_MISMATCHES(선언만 하고
 * 방치하던 목록)를 대체한다.
 */
export const LAYERS: Readonly<Record<LayerId, LayerDef>> = {
  CountryChoropleth: {
    phenomena: ['policy-standard'],
    nature: 'static-fact',
    motion: 'none',
    uncertainty: 'none',
  },
  ScalarFieldOverlay: {
    phenomena: 'active-overlay',
    nature: 'live-measure',
    motion: 'grow-in-once',
    uncertainty: 'none',
    overrides: [{
      channel: 'uncertaintyKind',
      reason: '문법 live-measure=dqss-badge 이나 격자 셀에는 DQSS 가 없다 (DQSS 는 관측소 단위 지표). ActiveLayerCard 가 출처·해상도·값범위를 대신 노출 — 없는 등급을 지어내지 않는다.',
    }],
  },
  StationLabels: {
    phenomena: ['pm25'],
    nature: 'live-measure',
    motion: 'pulse',
    // uncertainty='dqss-badge' 는 StationInfoPanel 의 배지로 이미 실현되어 있었고,
    // 2026-08-12(PR-B)부터 마커 자체의 alpha(instanceAlpha.ts)로도 실현된다 — DQSS
    // 낮은 관측소가 지도 위에서 흐리게 보인다. 문법 기본값과 같아 override 불요
    // (UncertaintyKind enum 확장은 과설계로 기각 — 배지와 같은 kind, 채널만 늘었다).
    uncertainty: 'dqss-badge',
    overrides: [{
      channel: 'motionKind',
      reason: '지상국은 정지(billboard)이고 pulse 는 위성 아이콘 한정 — 관측 플랫폼을 구분하는 신호라 문법의 grow-in-once 보다 정보량이 크다.',
    }],
  },
  CountryExtrude: {
    phenomena: ['pm25'],
    nature: 'live-measure',
    motion: 'grow-in-once',
    uncertainty: 'none',
    overrides: [{
      channel: 'uncertaintyKind',
      reason: '선택 국가의 농도 높이 표현. DQSS 는 같은 클릭으로 열리는 StationInfoPanel 이 표시 — 3D 기둥에 배지를 중복하지 않는다.',
    }],
  },
  PredictionMarkers: {
    phenomena: ['pm25-prediction'],
    nature: 'live-measure',
    motion: 'none',
    uncertainty: 'band-if-available',
    overrides: [
      {
        channel: 'motionKind',
        reason: '문법 기본 grow-in-once 는 격자/기둥의 높이·투명도 진입 램프인데, 실제 구현(useEffect init)은 count 설정과 동시에 인스턴스가 나타나고 이후엔 billboard 방향만 매 프레임 갱신한다 — 진입 애니메이션이 없다(현재 65개 소량 포인트라 램프 불요).',
      },
      {
        channel: 'uncertaintyKind',
        reason: '문법 기본 dqss-badge 는 관측(observed) 현상 전용이나 pm25-prediction 은 satellite-derived 모델 추정 — predict() 이 낸 p10-p90 분위수 밴드(band-if-available)로 표현한다. confidence_grade(A–F)는 DQSS 와 다른 quantity(prediction_confidence.py 산정)라 배지를 겹쳐 달지 않고 PredictionInfoPanel 이 별도 표기한다. 2026-08-12(PR-B): 마커 alpha = 상대 밴드 폭 — 계약이 hover/click 패널 수치뿐 아니라 마커 시각 채널에서도 실현된다.',
      },
    ],
  },
  AlertPulse: { phenomena: ['pm25'], nature: 'alert', motion: 'pulse', uncertainty: 'none' },
  FireHotspots: { phenomena: ['fire'], nature: 'alert', motion: 'pulse', uncertainty: 'none' },
  WindParticles: { phenomena: ['wind'], nature: 'flow', motion: 'continuous-flow', uncertainty: 'none' },
  SmokeEmitter: { phenomena: ['smoke'], nature: 'flow', motion: 'continuous-flow', uncertainty: 'none' },
  DataArcs: {
    phenomena: ['pm25'],
    nature: 'flow',
    motion: 'draw-on-once',
    uncertainty: 'none',
    overrides: [{
      channel: 'motionKind',
      reason: '수송 arc 셰이더는 uProgress 로 1회 그려지고 멈춘다 (반복 이류 아님). 직전 레지스트리가 continuous-flow 로 "정합 ✓" 라 적었던 것은 오기 — 구현 실측으로 정정.',
    }],
  },
  PollenParticles: {
    phenomena: ['pollen_grass', 'pollen_birch', 'pollen_alder', 'pollen_mugwort', 'pollen_olive', 'pollen_ragweed'],
    nature: 'live-measure',
    motion: 'continuous-flow',
    uncertainty: 'none',
    overrides: [
      {
        channel: 'motionKind',
        reason: '화분은 실측 농도로 스폰하되 대기 부유가 본질이라 continuous drift 로 렌더한다 (측정치 = live-measure, 거동 = flow).',
      },
      {
        channel: 'uncertaintyKind',
        reason: 'CAMS 예보 격자에는 관측소 DQSS 가 없다. 커버리지 한계(유럽)는 pipeline.coverage 로 명시.',
      },
    ],
  },
};

// ── 파생 API — 다른 모듈은 전부 여기서 읽는다 ─────────────────────────────────

const ENTRIES = Object.entries(PHENOMENA) as [PhenomenonId, PhenomenonDef][];

/** 격자 텍스처로 렌더 가능한 피드 (바람은 벡터장이라 제외 — 파티클이 그린다). */
const GRID_FEEDS: readonly FeedKind[] = ['aq-grid', 'weather-grid', 'marine-grid', 'pollen-grid'];

export function isOverlayId(id: PhenomenonId): id is Exclude<OverlayType, 'none'> {
  return id !== 'fire' && id !== 'smoke' && id !== 'transport' && id !== 'policy-standard' && id !== 'pm25-prediction';
}

/** 격자로 실제 렌더 가능한 오버레이 = 격자 피드 + 색 스케일 둘 다 보유. */
export const RENDERABLE_OVERLAYS: readonly OverlayType[] = ENTRIES
  .filter(([id, d]) => isOverlayId(id) && !!d.legend && !!d.pipeline && GRID_FEEDS.includes(d.pipeline.feed))
  .map(([id]) => id as OverlayType);

/** 한 피드를 공유하는 현상들의 공통 파이프라인 (경로·주기·해상도는 피드 단위로 같다). */
export function feedPipeline(feed: FeedKind): PhenomenonPipeline {
  const hit = ENTRIES.find(([, d]) => d.pipeline?.feed === feed);
  if (!hit) throw new Error(`ontology: 피드 정의 없음 — ${feed}`);
  return hit[1].pipeline!;
}

/** 피드 payload 안의 변수 키 맵 (오버레이 → varKey). 피드에 속한 오버레이만. */
export function feedVarKeys(feed: FeedKind): Partial<Record<OverlayType, string>> {
  return Object.fromEntries(
    ENTRIES
      .filter(([id, d]) => isOverlayId(id) && d.pipeline?.feed === feed && !!d.pipeline.varKey)
      .map(([id, d]) => [id, d.pipeline!.varKey!]),
  );
}

/** 오버레이별 경로 맵 (Storage / 정적). 피드가 오버레이마다 다른 파일을 쓰는 aq-grid 용. */
export function feedObjectPaths(
  feed: FeedKind,
  which: 'storagePath' | 'cdnPath' | 'staticPath',
): Partial<Record<OverlayType, string>> {
  return Object.fromEntries(
    ENTRIES
      .filter(([id, d]) => isOverlayId(id) && d.pipeline?.feed === feed && !!d.pipeline[which])
      .map(([id, d]) => [id, d.pipeline![which]!]),
  );
}

/** 오버레이의 현상 정의 ('none' 은 현상이 아니다). */
export function overlayPhenomenon(o: OverlayType): PhenomenonDef | null {
  return o === 'none' ? null : PHENOMENA[o];
}

/** 레이어의 해소된 시각 계약 + 문법 기본값 (차이 = overrides 가 설명해야 한다). */
export function layerContract(layer: LayerId): {
  readonly nature: DataNature;
  readonly motion: MotionKind;
  readonly uncertainty: UncertaintyKind;
  readonly grammarDefault: VizChannelContract;
} {
  const def = LAYERS[layer];
  return {
    nature: def.nature,
    motion: def.motion,
    uncertainty: def.uncertainty,
    grammarDefault: GRAMMAR[def.nature],
  };
}

/** 바람 레벨 → 파일 slug. 수집기(scripts/etl/collect_gfs_wind.py)의 slug 규칙과 동일. */
export function windLevelSlug(level: WindLevel): string {
  return `wind-${level.toLowerCase()}`;
}

/** 바람 레벨의 HUD 표기 (`surface` → SFC, `850hPa` → 850). */
export function windLevelLabel(level: WindLevel): string {
  return level === 'surface' ? 'SFC' : level.replace('hPa', '');
}

/** 바람이 제공하는 고도 (수집기가 실제로 가져오는 것만 — 없는 고도를 셀렉터에 띄우지 않는다). */
export const WIND_LEVELS: readonly WindLevel[] = PHENOMENA.wind.verticalLevels.filter(
  (l): l is WindLevel => l === 'surface' || l === '850hPa',
);

/** 바람 신선도 SLA (시간). 초과 시 stale — 가짜 최신 표시 금지. */
export const WIND_FRESHNESS_SLA_H: number = PHENOMENA.wind.pipeline!.freshnessSlaH!;

/** 화재 피드 신선도 SLA (시간). 초과 시 stale — 정지한 수집을 최신으로 보이게 두지 않는다. */
export const FIRE_FRESHNESS_SLA_H: number = PHENOMENA.fire.pipeline!.freshnessSlaH!;

/** PM2.5 예보 타임라인 stale 임계 (ms). */
export const TIMELINE_STALE_MS: number = PHENOMENA.pm25.forecastPipeline!.freshnessSlaH! * 3600 * 1000;

/**
 * 이송 렌즈(P6) 인식론 — 파생 표현이라 항상 `inferred`. 범례가 "시각적 추정 · 화학수송모델
 * 아님" 캐비어트를 표기할 의무의 근거(없는 인과를 지어내지 않는다).
 */
export const TRANSPORT_LENS_PROVENANCE: readonly ProvenanceKind[] = PHENOMENA.transport.provenance;

/**
 * 이송 렌즈 파티클 색의 출처 = 출발지 농도장(PM2.5). 범례 램프를 이 오버레이의 스케일에서
 * 그려 렌더(파티클 셰이더)↔범례 색 불일치를 원천 차단한다.
 */
export const TRANSPORT_LENS_SOURCE_OVERLAY: OverlayType = 'pm25';
