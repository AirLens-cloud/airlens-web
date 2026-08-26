/**
 * globeVizGrammar — 데이터 성격 → 시각 채널 문법 (viz grammar) 선언 정본.
 *
 * 목적: "이 데이터는 어떤 성격인가(nature)"만 등록하면 색·모션·불확실성 표현이
 * 문법 표(GRAMMAR)에서 유도되도록 하는 *선언 층*. 향후 대기환경 온톨로지 고도화 때
 * 새 데이터 타입은 nature 하나만 태깅하면 시각 계약이 결정된다.
 *
 * 스코프 (P2 온톨로지 배선 후):
 * - 본 파일 = **계층 4 문법 표만** (nature → 색역할/모션/불확실성).
 * - "어떤 레이어가 어떤 nature 인가"(구 LAYER_NATURE)와 문법에서 벗어난 채널의 사유
 *   (구 GRAMMAR_MISMATCHES)는 `globeOntology.ts` 의 LAYERS 로 이관 — 거기서 현상·파이프라인과
 *   한 몸으로 관리되고, 레이어·범례·fetch 경로가 실제로 그 값을 읽는다.
 *
 * 왜 색을 통일하지 않는가: globe 는 어두운 몰입 stage 라 채도 높은(vivid) 색이 판독되고
 * 본문은 종이-잉크 표면이라 desaturated 토큰이 대비를 지킨다(globeOverlays.ts 참조).
 * 본 문법의 colorRole 은 *역할*만 규정하며 실제 hex 는 각 표면 SSOT 가 소유한다.
 *
 * Glass-box 불변: forecast/inference 는 uncertainty 채널이 필수. p10-p90 밴드는
 * 데이터가 실제로 제공될 때만 렌더하고 **없으면 fabricate 하지 않는다**(caveat 로 대체).
 */

/** 데이터 성격 6종 — 시각 채널을 유도하는 단일 축. */
export type DataNature =
  | 'static-fact' // 규제/행정 사실 (거의 불변, 연 단위)
  | 'live-measure' // 실측 관측값 (station/spike/scalar field)
  | 'alert' // 임계 초과·이벤트 (fire/경보)
  | 'flow' // 이류·수송 벡터장 (wind/arc/smoke)
  | 'forecast' // 미래 예측 (GEFS 타임라인)
  | 'inference'; // 인과 추론 (SDID 반사실)

/** 모션 채널 — 데이터 성격이 어떻게 움직이는가. */
export type MotionKind =
  | 'none' // 정지
  | 'grow-in-once' // 진입 시 1회 성장(높이/투명도 램프) 후 정지
  | 'pulse' // 주의 환기용 주기 맥동
  | 'continuous-flow' // 지속 이류 (벡터장)
  | 'time-scrub' // 타임라인 스크럽으로 프레임 전환
  | 'draw-on-once'; // 진입 시 1회 그려짐 (경로/곡선)

/** 색 역할 채널 — 실제 hex 는 표면 SSOT 소유, 여기선 역할만. */
export type ColorRole =
  | 'neutral-sequential' // 중성 순차 스케일 (규제 강도 등)
  | 'vivid-categorical' // 어두운 stage 위 고채도 등급색 (AQI)
  | 'warning-fixed' // 고정 경고색 (빨강 계열)
  | 'accent-low-contrast' // 저대비 강조 (벡터장 — 데이터 위 겹침)
  | 'same-as-measure' // 대응 실측과 동일 스케일 (예측이 실측과 비교 가능)
  | 'actual-vs-counterfactual'; // 실측 vs 반사실 2색 대비 (인과)

/** 불확실성 채널 — Glass-box 표현 계약. */
export type UncertaintyKind =
  | 'none' // 불확실성 표현 불요 (사실/벡터장)
  | 'dqss-badge' // DQSS 등급 배지
  | 'explicit-caveat' // 명시적 주의문 (예측 — 밴드 없으면 fabricate 금지)
  | 'band-if-available'; // p10-p90 밴드, 데이터 있을 때만 (없으면 caveat)

/** nature → 시각 채널 계약. */
export interface VizChannelContract {
  readonly motionKind: MotionKind;
  readonly colorRole: ColorRole;
  readonly uncertaintyKind: UncertaintyKind;
}

/**
 * 문법 표 — 데이터 성격 6종의 시각 채널 계약 (플랜 승인분).
 *
 * | nature       | color                     | motion          | uncertainty       |
 * |--------------|---------------------------|-----------------|-------------------|
 * | static-fact  | neutral-sequential        | none            | none              |
 * | live-measure | vivid-categorical         | grow-in-once    | dqss-badge        |
 * | alert        | warning-fixed             | pulse           | none              |
 * | flow         | accent-low-contrast       | continuous-flow | none              |
 * | forecast     | same-as-measure           | time-scrub      | explicit-caveat   |
 * | inference    | actual-vs-counterfactual  | draw-on-once    | band-if-available |
 */
export const GRAMMAR: Readonly<Record<DataNature, VizChannelContract>> = {
  'static-fact': { colorRole: 'neutral-sequential', motionKind: 'none', uncertaintyKind: 'none' },
  'live-measure': { colorRole: 'vivid-categorical', motionKind: 'grow-in-once', uncertaintyKind: 'dqss-badge' },
  alert: { colorRole: 'warning-fixed', motionKind: 'pulse', uncertaintyKind: 'none' },
  flow: { colorRole: 'accent-low-contrast', motionKind: 'continuous-flow', uncertaintyKind: 'none' },
  forecast: { colorRole: 'same-as-measure', motionKind: 'time-scrub', uncertaintyKind: 'explicit-caveat' },
  inference: { colorRole: 'actual-vs-counterfactual', motionKind: 'draw-on-once', uncertaintyKind: 'band-if-available' },
};

/**
 * 렌더 원칙 — 어두운 야간면 지구 위에서 데이터 레이어가 "검은색"으로 소멸하지 않도록 하는
 * 매질 적응 규칙 (globe viz layer identity 프로그램에서 성문화). colorRole/hex 는 각 표면
 * SSOT 소유이나, 아래는 *렌더 계약*으로 모든 데이터 레이어가 준수한다.
 *
 * 왜 legend 와 drift 하지 않는가: 원칙 3(명도 플로어)은 authored stop 에 baked 되어
 * legend·render 가 동일 배열을 참조한다(globeOverlays.ts). 원칙 2(발광 블렌딩)는 globe
 * 전용 — legend 는 밝은 카드라 additive 불요. 즉 색 *시퀀스*는 공유, 매질 적응만 분리.
 */
export const RENDER_PRINCIPLES = [
  {
    id: 'no-black-lowend',
    rule: '저값/데이터 부재는 투명으로 — 검정 종점 금지',
    rationale: '어두운 지구 위 검정은 데이터 없음과 구별 불가. 연기 age-lerp 종점을 #0a0a0a→쿨그레이로 교체.',
    realizedBy: ['SmokeEmitter', 'ScalarFieldOverlay'],
  },
  {
    id: 'emissive-additive',
    rule: '발광층(화재·에너지)은 AdditiveBlending + toneMapped:false',
    rationale: '야간면에서 실제 발광으로 읽히게. FireHotspots radial-glow 스프라이트.',
    realizedBy: ['FireHotspots'],
  },
  {
    id: 'oklab-lightness-floor',
    rule: '비발광층 색은 OKLab L≥0.45 (색상·채도 보존, 명도만 상향)',
    rationale: '어두운 파랑 저값(temp/sst/currents/ssta/rh)이 밤면에서 검게 읽힘. oklabLightnessFloor 로 상향, authored stop 에 baked.',
    realizedBy: ['ScalarFieldOverlay'],
  },
  {
    id: 'legend-equals-render-sequence',
    rule: 'legend 램프와 렌더 램프는 동일 색 배열(SOT) 참조',
    rationale: 'OVERLAY_SCALE_MAP·COLOR_BAR_CONFIGS 가 earth/config 스케일을 공유 — 표시·렌더 불일치 원천 차단.',
    realizedBy: ['ScalarFieldOverlay', 'CountryChoropleth'],
  },
] as const;

/**
 * forecast / inference nature 는 현재 *전용 마운트 scene 레이어가 없다*.
 * - forecast(GEFS) = ScalarFieldOverlay 를 타임라인 HUD(offset slider)가 구동해 실현.
 * - inference(SDID) = choropleth/패널 HUD DOM 에서 실현 (R3F scene 레이어 아님).
 * 전용 레이어 신설은 온톨로지 본작업의 확장점 — 이번엔 문법 표에만 계약을 둔다.
 */
export const NATURES_WITHOUT_DEDICATED_LAYER: readonly DataNature[] = ['forecast', 'inference'];
