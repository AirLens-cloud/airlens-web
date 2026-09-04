/**
 * glossaryTerms.ts — the glossary catalog for `/glossary` and TermLink
 * (page-specs/methodology-glossary-knowledge-system.md §5 GlossaryTerm model).
 *
 * Definitions are written to be consistent with this repo's own evidence
 * vocabulary as described in the approved page specs (DataNature-style
 * classification, p10-p90 uncertainty, DQSS quality grade, stale/withheld
 * status). EVIDENCE_CONTRACT.md itself was not locatable in this worktree at
 * authoring time — cross-check these definitions against it before treating
 * this file as the final SSOT (methodology-glossary-knowledge-system.md §8-2
 * requires definition-schema parity; that check is still open, see
 * Glossary.tsx header note).
 *
 * O1/O2 ontology extension (2026-09-02, design SOT:
 * AirLens-platform Obsidian-airlens/wiki/synthesis/
 * aq-ontology-feasibility-2026-09-02.md §3):
 *
 * - `relations` replaces the old flat `relatedTerms: string[]` as the single
 *   source of truth for how terms connect — each edge is typed
 *   (isA/partOf/measures/derivedFrom/contrastsWith/seeAlso). Use
 *   `relatedTermIds()` below wherever old code wanted a flat id list; do not
 *   hand-author a second array in parallel with `relations` (repo drift
 *   pattern this project's own docs warn against).
 * - `definitionKo` is a Korean companion to `definition` (still the single
 *   English string every existing consumer renders). This repo has no `/ko`
 *   route today (`src/lib/seo/pageSeo.ts` file header) — `definitionKo` is
 *   ontology data, not yet wired to any UI toggle.
 * - `align` / `unit` are populated ONLY where independently verified against
 *   the standard's own vocabulary (never guessed from a term's name):
 *   - SOSA classes confirmed live at https://www.w3.org/ns/sosa/ (2026-09-02):
 *     `Observation`, `ObservableProperty`, `Sensor` all resolve as documented
 *     OWL classes.
 *   - QUDT unit confirmed live at https://qudt.org/vocab/unit/MicroGM-PER-M3
 *     (2026-09-02): "Microgram per Cubic Metre", µg/m³ — matches every
 *     pollutant field in this repo (`AQI_CONFIG`, `OverlayType` µg/m³ fields).
 *   - EPA AQS parameter codes confirmed against the EPA AQS parameter code
 *     table (2026-09-02): 88101=PM2.5, 81102=PM10, 42602=NO2, 44201=O3,
 *     42401=SO2, 42101=CO.
 *   - CF `standard_name` is deliberately NOT populated on any term — the
 *     feasibility research downgrades it to "naming-convention reference
 *     only," not a verified alignment (no CF string was independently
 *     confirmed for this repo's fields).
 * - New terms are grounded in this repo's own content only (no invented ML
 *   engines): `src/lib/config/globeOntology.ts` (ProvenanceKind, DQSS grade
 *   cutoffs, FeedKind, PhenomenonId), `src/lib/config/aqi.ts` (DQSS scoring
 *   components, AQI thresholds), `src/lib/insights/insightsAttScale.ts`
 *   (SDID synthetic-control geometry), `src/content/methodologySections.ts`,
 *   and `src/content/legal.ts` (`DEPLOYED_MODELS` — confirms which natures
 *   are actually live on this site; Camera AI / TFT / GNN are explicitly
 *   absent from airlens-web today and are NOT represented here).
 */

export type GlossaryCategory = 'nature' | 'quality' | 'method' | 'ui'

/** Typed edge between two glossary terms (O1 ontology relations). */
export type RelationType = 'isA' | 'partOf' | 'measures' | 'derivedFrom' | 'contrastsWith' | 'seeAlso'

export interface TermRelation {
  type: RelationType
  /** termId of the related term. */
  target: string
}

/**
 * Alignment to external standards. Every field here was checked against the
 * standard's own published vocabulary before being added (see file header)
 * — this is deliberately sparse rather than filled in by guessing a
 * plausible-looking URI or code.
 */
export interface StandardAlignment {
  /** W3C/OGC SOSA class URI (http://www.w3.org/ns/sosa/...). */
  sosa?: string
  /** QUDT unit URI (http://qudt.org/vocab/unit/...). */
  qudt?: string
  /** EPA AQS parameter code (numeric string — e.g. "88101" = PM2.5). */
  epaAqs?: string
}

export interface GlossaryTerm {
  termId: string
  term: string
  /** English definition — the string every existing consumer (TermLink, Glossary) renders. */
  definition: string
  /** Korean companion definition (O1 bilingual definitions). Not yet rendered by any UI. */
  definitionKo?: string
  example: string
  methodRef?: string
  /** Typed relations to other terms — the ontology's edges (O1). Source of truth; see file header. */
  relations: TermRelation[]
  /** External standard alignment, only when independently confirmed (see `StandardAlignment`). */
  align?: StandardAlignment
  /** QUDT unit URI for this term's own quantity, when it denotes a unit-bearing measured value. */
  unit?: string
  /** Enumerated legal values, when this term itself names a controlled vocabulary (e.g. nature tags, DQSS grades). */
  controlledValues?: string[]
  natureTag: GlossaryCategory
}

/** QUDT unit URI for micrograms per cubic metre — every pollutant field in this repo uses µg/m³. */
const QUDT_UGM3 = 'http://qudt.org/vocab/unit/MicroGM-PER-M3'

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    termId: 'interpolated',
    term: 'Interpolated',
    definition:
      'A value estimated for a location that has no direct sensor, filled in from nearby measurements by weighting them by distance (e.g. inverse-distance weighting, IDW) rather than measured on the spot. AirLens’s published pollutant and weather grids are not interpolated in this sense — they are model analysis or forecast fields (see "analysis") sampled at the nearest grid point; this term describes the genuine client-side IDW fallback path used when no such grid is available, not the ordinary case.',
    definitionKo:
      '주변 측정값을 거리에 따라 가중 평균(예: 역거리가중, IDW)해 채워 넣은, 직접 센서가 없는 위치의 추정값입니다 — 그 자리에서 직접 측정한 값이 아닙니다. AirLens가 발행하는 오염물질·기상 격자는 이런 의미의 보간이 아닙니다 — 가장 가까운 격자점에서 읽은 모델 분석("analysis") 또는 예보 값입니다. 이 용어는 그런 격자가 없을 때만 쓰는 클라이언트 측 IDW 폴백 경로를 가리키며, 일반적인 경우를 뜻하지 않습니다.',
    example: '"18.2 µg/m³ (interpolated)" appears only on the IDW fallback path when no published grid covers this point; the ordinary grid reading is "analysis" or "forecast" instead.',
    methodRef: 'grid-vs-station',
    relations: [
      { type: 'isA', target: 'nature' },
      { type: 'contrastsWith', target: 'observed' },
      { type: 'contrastsWith', target: 'analysis' },
      { type: 'seeAlso', target: 'coverage' },
    ],
    natureTag: 'nature',
  },
  {
    termId: 'analysis',
    term: 'Analysis',
    definition:
      'A value read from a numerical model’s analysis field — the model’s own best estimate of the current state of the atmosphere or ocean (e.g. a data-assimilated 0-hour/"f000" run), not a forward-looking forecast and not a ground sensor reading. Most of AirLens’s published pollutant and weather grids are analysis fields, not interpolated ones.',
    definitionKo:
      '수치모델의 분석장(analysis field)에서 읽은 값입니다 — 미래를 내다보는 예보가 아니라, 모델이 자료동화를 거쳐 산출한 대기·해양의 현재 상태에 대한 최선의 추정치(예: 0시간/"f000" 실행)입니다. 지상 센서로 직접 측정한 값도 아닙니다. AirLens가 발행하는 오염물질·기상 격자 대부분은 보간이 아니라 이 분석장입니다.',
    example: '"PM2.5: 22.1 µg/m³ (analysis)" comes from NOAA GEFS-Aerosols’ f000/anl grid field, not a forecast run and not a ground station.',
    methodRef: 'nature-analysis',
    relations: [
      { type: 'isA', target: 'nature' },
      { type: 'contrastsWith', target: 'forecast' },
      { type: 'contrastsWith', target: 'interpolated' },
      { type: 'contrastsWith', target: 'observed' },
      { type: 'seeAlso', target: 'pm25' },
    ],
    natureTag: 'nature',
  },
  {
    termId: 'forecast',
    term: 'Forecast',
    definition:
      'A value that describes a future or near-future condition, produced by a model run rather than observed at that time.',
    definitionKo:
      '실제 관측이 아니라 모델 실행으로 산출된, 미래 또는 근미래 상태를 서술하는 값입니다.',
    example: '"32.1 µg/m³ (forecast, +6h)" shown with a p10–p90 range rather than a single number.',
    methodRef: 'forecast',
    relations: [
      { type: 'isA', target: 'nature' },
      { type: 'seeAlso', target: 'p10-p90' },
      { type: 'seeAlso', target: 'sdid' },
    ],
    natureTag: 'nature',
  },
  {
    termId: 'p10-p90',
    term: 'p10–p90',
    definition:
      'The uncertainty range around an estimate: the true value is expected to fall between the 10th and 90th percentile band roughly 80% of the time. It is not an error bar drawn for decoration — it is the model’s own stated confidence.',
    definitionKo:
      '추정치를 둘러싼 불확실성 구간입니다 — 실제 값이 10~90 백분위수 범위 안에 들 확률이 대략 80%라는 뜻으로, 장식용 오차막대가 아니라 모델 스스로가 밝히는 신뢰 수준입니다.',
    example: '"24 µg/m³ (p10 18 – p90 31)" means the model expects the true value most likely somewhere in that band.',
    methodRef: 'uncertainty',
    relations: [
      { type: 'seeAlso', target: 'dqss' },
      { type: 'seeAlso', target: 'forecast' },
      { type: 'seeAlso', target: 'coverage' },
    ],
    natureTag: 'quality',
  },
  {
    termId: 'dqss',
    term: 'DQSS',
    definition:
      'Data Quality & Source Score — a letter grade (A–F) summarizing how much confidence to place in a given value, based on source tier, freshness, and coverage.',
    definitionKo:
      '데이터 품질·출처 점수(Data Quality & Source Score) — 출처 등급, 신선도, 커버리지를 바탕으로 특정 값을 얼마나 신뢰할 수 있는지 요약한 문자 등급(A~F)입니다.',
    example: 'A value badged "DQSS: B" is trustworthy but not the highest tier available for that location.',
    methodRef: 'dqss',
    relations: [
      { type: 'seeAlso', target: 'p10-p90' },
      { type: 'seeAlso', target: 'coverage' },
      { type: 'seeAlso', target: 'freshness' },
      { type: 'seeAlso', target: 'source-tier' },
      { type: 'seeAlso', target: 'dqss-grade' },
    ],
    natureTag: 'quality',
  },
  {
    termId: 'nature',
    term: 'Nature',
    definition:
      'The classification AirLens attaches to every value describing how it was produced — for example observation, interpolated, or forecast. Nature is shown at the value itself, not buried in a footnote.',
    definitionKo:
      'AirLens가 모든 값에 붙이는, 그 값이 어떻게 생성되었는지를 나타내는 분류입니다 — 예를 들어 관측, 보간, 예보가 있습니다. Nature는 각주가 아니라 값 자체에 표시됩니다.',
    example: 'A value labeled "nature: forecast" is drawn with a hatch pattern rather than a solid fill to mark it as not-yet-observed.',
    methodRef: 'nature-overview',
    relations: [
      { type: 'seeAlso', target: 'observed' },
      { type: 'seeAlso', target: 'analysis' },
      { type: 'seeAlso', target: 'interpolated' },
      { type: 'seeAlso', target: 'satellite-derived' },
      { type: 'seeAlso', target: 'forecast' },
      { type: 'seeAlso', target: 'inferred' },
      { type: 'seeAlso', target: 'nature-policy' },
      { type: 'seeAlso', target: 'coverage' },
    ],
    // The 7-value Evidence Contract v1 vocabulary (`nature` enum in
    // `airlens-data/contracts/evidence-envelope.v1.schema.json`), verbatim.
    // `globeOntology.ts`'s `ProvenanceKind` union now spells these identically
    // ('observation', 'analysis', 'interpolated', 'forecast', 'satellite-derived',
    // 'inferred', 'policy') — the 'observed'/'model-forecast' code-level synonym
    // this comment used to record was reconciled on 2026-09-04 rather than left
    // to drift permanently; see the ProvenanceKind doc comment for detail.
    controlledValues: ['observation', 'analysis', 'interpolated', 'forecast', 'satellite-derived', 'inferred', 'policy'],
    natureTag: 'nature',
  },
  {
    termId: 'stale',
    term: 'Stale',
    definition:
      'A value whose last successful update is older than the freshness window AirLens expects for that source. Stale values are still shown, but marked as stale with the last-known time — not silently replaced with a newer-looking placeholder.',
    definitionKo:
      '마지막 성공적 갱신이 해당 출처의 신선도 기준 시간보다 오래된 값입니다. Stale 값도 여전히 표시되지만 마지막으로 확인된 시각과 함께 stale로 표시됩니다 — 최신처럼 보이는 대체값으로 조용히 바뀌지 않습니다.',
    example: '"Last updated 6h ago (stale)" instead of quietly showing an old number as if it were current.',
    relations: [
      { type: 'contrastsWith', target: 'withheld' },
      { type: 'seeAlso', target: 'dqss' },
      { type: 'seeAlso', target: 'freshness' },
    ],
    natureTag: 'ui',
  },
  {
    termId: 'withheld',
    term: 'Withheld',
    definition:
      'AirLens deliberately does not show a value when confidence is too low to publish it responsibly — a withheld value is not a bug or missing data, it is a decision.',
    definitionKo:
      'AirLens는 신뢰도가 책임 있게 공개하기에 너무 낮을 때 의도적으로 값을 표시하지 않습니다 — withheld 값은 버그나 누락된 데이터가 아니라 하나의 결정입니다.',
    example: 'A grid cell with no nearby sensor and no reliable satellite pass shows "Withheld" rather than a guessed number.',
    relations: [
      { type: 'contrastsWith', target: 'stale' },
      { type: 'seeAlso', target: 'dqss' },
      { type: 'seeAlso', target: 'coverage' },
    ],
    natureTag: 'ui',
  },
  {
    termId: 'aqi',
    term: 'AQI',
    definition:
      'Air Quality Index — a standardized 0–500+ scale converting raw pollutant concentrations into health-relevant tiers (good, moderate, unhealthy, etc). AirLens follows EPA breakpoints; one AirLens-specific threshold used in a couple of surfaces is disclosed as not standard.',
    definitionKo:
      '대기질 지수(Air Quality Index) — 원시 오염물질 농도를 건강 관련 등급(양호·보통·나쁨 등)으로 변환하는 0~500+ 표준 척도입니다. AirLens는 EPA 경계값을 따르며, 일부 화면에서 쓰는 AirLens 자체 기준 하나는 표준이 아님을 명시합니다.',
    example: '"AQI 142 (Unhealthy for Sensitive Groups)" derived from a measured or estimated PM2.5 concentration.',
    methodRef: 'aqi-conversion',
    relations: [
      { type: 'derivedFrom', target: 'pm25' },
      { type: 'seeAlso', target: 'grade-cut' },
    ],
    natureTag: 'method',
  },
  {
    termId: 'pm25',
    term: 'PM2.5',
    definition:
      'Fine particulate matter 2.5 micrometers or smaller — the primary pollutant AirLens tracks, measured in µg/m³. It is the input most AQI conversions and forecasts on this site are built from.',
    definitionKo:
      '지름 2.5마이크로미터 이하의 미세먼지로, AirLens가 추적하는 주 오염물질이며 µg/m³ 단위로 측정합니다. 이 사이트의 AQI 변환과 예보 대부분이 이 값을 입력으로 삼습니다.',
    example: '"PM2.5: 24.6 µg/m³" is the raw concentration before it is converted to an AQI tier.',
    methodRef: 'aqi-conversion',
    relations: [
      { type: 'isA', target: 'overlay' },
      { type: 'seeAlso', target: 'aqi' },
      { type: 'seeAlso', target: 'coverage' },
      { type: 'seeAlso', target: 'aod' },
      { type: 'seeAlso', target: 'station' },
    ],
    align: { qudt: QUDT_UGM3, epaAqs: '88101' },
    unit: QUDT_UGM3,
    natureTag: 'method',
  },
  {
    termId: 'sdid',
    term: 'SDID',
    definition:
      'Synthetic Difference-in-Differences — a causal-inference method used on Insights to estimate what a policy likely changed, by comparing the treated area against a statistically constructed synthetic control.',
    definitionKo:
      '합성 이중차분법(Synthetic Difference-in-Differences) — 정책이 적용된 지역을 통계적으로 구성한 합성 대조군과 비교해, 그 정책이 실제로 무엇을 바꿨는지 추정하는 인과추론 기법입니다. Insights에서 사용합니다.',
    example: 'An SDID estimate reads "likely reduced PM2.5 by 4.2 µg/m³ (ATT)" rather than claiming certainty.',
    methodRef: 'sdid',
    relations: [
      { type: 'seeAlso', target: 'att' },
      { type: 'seeAlso', target: 'forecast' },
      { type: 'seeAlso', target: 'synthetic-control' },
      { type: 'seeAlso', target: 'nature-policy' },
    ],
    natureTag: 'method',
  },
  {
    termId: 'att',
    term: 'ATT',
    definition:
      'Average Treatment effect on the Treated — the specific quantity an SDID analysis estimates: on average, how much did the outcome change for the units that actually experienced the policy, compared to their synthetic counterfactual.',
    definitionKo:
      '처치집단 평균 처치효과(Average Treatment effect on the Treated) — SDID 분석이 추정하는 구체적인 값으로, 정책을 실제로 적용받은 대상의 결과가 합성 반사실 대비 평균적으로 얼마나 변했는지를 나타냅니다.',
    example: 'An ATT of "−4.2 µg/m³" means the treated cities averaged 4.2 µg/m³ lower PM2.5 than their synthetic control predicts.',
    methodRef: 'sdid',
    relations: [{ type: 'derivedFrom', target: 'sdid' }],
    natureTag: 'method',
  },
  {
    termId: 'coverage',
    term: 'Coverage',
    definition:
      'How much of a region has a nearby, trustworthy data source versus relying on interpolation or being withheld outright. Coverage is why some areas show confident readings and neighboring areas show "withheld."',
    definitionKo:
      '한 지역이 얼마나 신뢰할 수 있는 인접 데이터 출처를 가지고 있는지, 아니면 보간이나 withheld에 의존하는지를 나타냅니다. Coverage 때문에 어떤 지역은 확신 있는 값을, 인접 지역은 "withheld"를 보여줍니다.',
    example: 'A city with three ground stations has high coverage; a remote area relying on satellite-only estimates has lower coverage.',
    methodRef: 'grid-vs-station',
    relations: [
      { type: 'seeAlso', target: 'interpolated' },
      { type: 'seeAlso', target: 'withheld' },
      { type: 'seeAlso', target: 'dqss' },
      { type: 'seeAlso', target: 'station' },
      { type: 'seeAlso', target: 'grid-cell' },
    ],
    natureTag: 'quality',
  },

  // ── O1 extension — new terms (2026-09-02) ──────────────────────────────

  {
    termId: 'observed',
    term: 'Observed',
    definition:
      'A value read directly from a ground sensor at approximately the time and place shown — the most direct evidence AirLens has, with no interpolation or model between the sensor and the number.',
    definitionKo:
      '표시된 시각·위치 그대로 지상 센서에서 직접 읽은 값입니다 — 센서와 수치 사이에 보간이나 모델이 끼어들지 않은, AirLens가 가진 가장 직접적인 증거입니다.',
    example: '"PM2.5: 12.4 µg/m³ (observed)" comes straight from a ground-station reading, not an estimate.',
    methodRef: 'nature-observation',
    relations: [
      { type: 'isA', target: 'nature' },
      { type: 'contrastsWith', target: 'interpolated' },
      { type: 'seeAlso', target: 'station' },
    ],
    align: { sosa: 'http://www.w3.org/ns/sosa/Observation' },
    natureTag: 'nature',
  },
  {
    termId: 'satellite-derived',
    term: 'Satellite-derived',
    definition:
      'A value estimated from satellite instrument readings — most often aerosol optical depth (AOD) — converted to a ground-level pollutant estimate, extending coverage to places no ground sensor reaches.',
    definitionKo:
      '위성 계측값, 주로 에어로졸 광학 두께(AOD)를 지상 오염물질 추정치로 변환한 값입니다. 지상 센서가 없는 지역까지 커버리지를 확장합니다.',
    example: '"PM2.5: 18.7 µg/m³ (satellite-derived)" is converted from an AOD reading, not read from a sensor.',
    methodRef: 'nature-satellite-derived',
    relations: [
      { type: 'isA', target: 'nature' },
      { type: 'derivedFrom', target: 'aod' },
      { type: 'seeAlso', target: 'pm25' },
      { type: 'seeAlso', target: 'coverage' },
    ],
    natureTag: 'nature',
  },
  {
    termId: 'inferred',
    term: 'Inferred',
    definition:
      'A value derived through statistical or causal analysis rather than direct measurement or forward-looking simulation — for example, an estimated policy effect.',
    definitionKo:
      '직접 측정이나 미래 예측 시뮬레이션이 아니라 통계적·인과적 분석을 거쳐 도출한 값입니다 — 예를 들어 추정된 정책 효과가 여기 해당합니다.',
    example: '"−4.2 µg/m³ (inferred, ATT)" comes from a causal model, not a measurement.',
    methodRef: 'nature-inferred',
    relations: [
      { type: 'isA', target: 'nature' },
      { type: 'seeAlso', target: 'sdid' },
      { type: 'seeAlso', target: 'att' },
    ],
    natureTag: 'nature',
  },
  {
    termId: 'nature-policy',
    term: 'Policy (nature)',
    definition:
      "A value or annotation describing a policy action itself — for example a low-emission-zone start date — rather than a measured pollutant. Usually shown alongside an inferred effect to give it context.",
    definitionKo:
      '측정된 오염물질이 아니라 정책 조치 자체를 서술하는 값 또는 주석입니다 — 예를 들어 저공해구역 시행일이 여기 해당합니다. 보통 추론된(inferred) 효과와 함께 표시되어 맥락을 제공합니다.',
    example: '"Low-emission zone started 2021-03-01 (policy)" is shown next to the ATT it produced.',
    methodRef: 'nature-policy',
    relations: [
      { type: 'isA', target: 'nature' },
      { type: 'seeAlso', target: 'sdid' },
      { type: 'seeAlso', target: 'inferred' },
    ],
    natureTag: 'nature',
  },
  {
    termId: 'dqss-grade',
    term: 'DQSS grade',
    definition:
      'The single letter (A–F) DQSS reduces its underlying score to for display — the badge you actually see, standing in for the fuller freshness/source-tier/coverage picture behind it.',
    definitionKo:
      'DQSS가 내부 점수를 화면 표시용으로 압축한 단일 문자 등급(A~F)입니다 — 그 뒤의 신선도·출처 등급·커버리지 전체를 대표하는 배지입니다.',
    example: '"DQSS: B" is the grade shown to a visitor; the score behind it is a number on a 0–100 scale.',
    methodRef: 'dqss',
    relations: [
      { type: 'derivedFrom', target: 'dqss' },
      { type: 'seeAlso', target: 'grade-cut' },
    ],
    controlledValues: ['A', 'B', 'C', 'D', 'F'],
    natureTag: 'quality',
  },
  {
    termId: 'freshness',
    term: 'Freshness',
    definition:
      "How recently a value was last successfully updated, measured against the update window AirLens expects for its source — one of the inputs behind both a stale label and a DQSS grade.",
    definitionKo:
      '값이 마지막으로 성공적으로 갱신된 시점을 그 출처가 요구하는 갱신 주기와 비교한 것입니다 — stale 표시와 DQSS 등급을 구성하는 요소 중 하나입니다.',
    example: '"Registry fetched 3m ago" reports the freshness of that page’s own data.',
    relations: [
      { type: 'partOf', target: 'dqss' },
      { type: 'seeAlso', target: 'stale' },
    ],
    natureTag: 'quality',
  },
  {
    termId: 'source-tier',
    term: 'Source tier',
    definition:
      "The category a data source falls into — for example a government-operated station versus a community sensor — used as one input to a value's DQSS grade.",
    definitionKo:
      '데이터 출처가 속하는 범주입니다 — 예를 들어 정부 운영 관측소인지 커뮤니티 센서인지가 여기 해당하며, DQSS 등급을 구성하는 요소 중 하나로 쓰입니다.',
    example: "A government-operated station's reading typically earns a higher source-tier bonus than a community sensor's.",
    relations: [
      { type: 'partOf', target: 'dqss' },
      { type: 'seeAlso', target: 'station' },
    ],
    natureTag: 'quality',
  },
  {
    termId: 'grade-cut',
    term: 'Grade cut',
    definition:
      'The concentration or score boundary separating one tier from the next — for example the µg/m³ value where AQI moves from Good to Moderate, or the DQSS score where a B becomes a C.',
    definitionKo:
      '한 등급에서 다음 등급으로 넘어가는 농도 또는 점수 경계입니다 — 예를 들어 AQI가 Good에서 Moderate로 바뀌는 µg/m³ 값, 혹은 DQSS 점수가 B에서 C로 바뀌는 지점이 여기 해당합니다.',
    example: 'PM2.5 crossing 9 µg/m³ is the grade-cut between AQI Good and Moderate under the EPA 2024 breakpoints AirLens follows.',
    relations: [
      { type: 'seeAlso', target: 'aqi' },
      { type: 'seeAlso', target: 'dqss-grade' },
      { type: 'seeAlso', target: 'pm25' },
      { type: 'seeAlso', target: 'pm10' },
    ],
    natureTag: 'quality',
  },
  {
    termId: 'pm10',
    term: 'PM10',
    definition:
      'Particulate matter 10 micrometers or smaller, measured in µg/m³ — coarser than PM2.5, with its own separate AQI grade boundaries (roughly 2–4× the PM2.5 concentration for the same tier).',
    definitionKo:
      '지름 10마이크로미터 이하의 미세먼지로, µg/m³ 단위로 측정합니다 — PM2.5보다 입자가 크며, 같은 등급이라도 PM2.5보다 대략 2~4배 높은 농도에서 등급 경계가 그어지는 별도의 AQI 기준을 가집니다.',
    example: '"PM10: 42 µg/m³" is reported alongside PM2.5, not folded into the same grade scale.',
    relations: [
      { type: 'isA', target: 'overlay' },
      { type: 'contrastsWith', target: 'pm25' },
      { type: 'seeAlso', target: 'grade-cut' },
    ],
    align: { qudt: QUDT_UGM3, epaAqs: '81102' },
    unit: QUDT_UGM3,
    natureTag: 'method',
  },
  {
    termId: 'aod',
    term: 'AOD (Aerosol Optical Depth)',
    definition:
      'A satellite-measured quantity describing how much light is scattered or absorbed by aerosol particles in a column of atmosphere — the raw satellite signal AirLens converts into a satellite-derived PM2.5 estimate.',
    definitionKo:
      '대기 기둥 속 에어로졸 입자가 빛을 얼마나 산란·흡수하는지를 위성으로 측정한 값입니다 — AirLens가 위성 기반 PM2.5 추정치로 변환하는 원본 위성 신호입니다.',
    example: 'A high AOD reading over a region with no ground station is what triggers a satellite-derived PM2.5 estimate there.',
    methodRef: 'nature-satellite-derived',
    relations: [
      { type: 'measures', target: 'satellite-derived' },
      { type: 'seeAlso', target: 'pm25' },
    ],
    natureTag: 'method',
  },
  {
    termId: 'no2',
    term: 'NO2 (Nitrogen Dioxide)',
    definition:
      'A gaseous pollutant tracked alongside PM2.5 and PM10, measured in µg/m³, mostly from combustion sources such as traffic.',
    definitionKo:
      'PM2.5, PM10과 함께 추적하는 기체 오염물질로, µg/m³ 단위로 측정하며 주로 교통 등 연소원에서 발생합니다.',
    example: '"NO2: 21 µg/m³" is one of the overlay layers available on the Globe.',
    relations: [{ type: 'isA', target: 'overlay' }],
    align: { qudt: QUDT_UGM3, epaAqs: '42602' },
    unit: QUDT_UGM3,
    natureTag: 'method',
  },
  {
    termId: 'o3',
    term: 'O3 (Ozone)',
    definition:
      'Ground-level ozone, a gaseous pollutant AirLens tracks as a separate overlay from particulate matter, measured in µg/m³.',
    definitionKo:
      '지표 오존으로, 입자상 물질과 별도의 오버레이로 추적하는 기체 오염물질이며 µg/m³ 단위로 측정합니다.',
    example: '"O3: 68 µg/m³" is shown as its own overlay layer, distinct from PM2.5/PM10.',
    relations: [{ type: 'isA', target: 'overlay' }],
    align: { qudt: QUDT_UGM3, epaAqs: '44201' },
    unit: QUDT_UGM3,
    natureTag: 'method',
  },
  {
    termId: 'so2',
    term: 'SO2 (Sulfur Dioxide)',
    definition:
      'A gaseous pollutant tracked as a separate overlay, measured in µg/m³, typically associated with fossil-fuel combustion and industrial sources.',
    definitionKo:
      '별도 오버레이로 추적하는 기체 오염물질로, µg/m³ 단위로 측정하며 주로 화석연료 연소와 산업 배출원과 관련됩니다.',
    example: '"SO2" appears in the same overlay picker as PM2.5, NO2, and O3.',
    relations: [{ type: 'isA', target: 'overlay' }],
    align: { qudt: QUDT_UGM3, epaAqs: '42401' },
    unit: QUDT_UGM3,
    natureTag: 'method',
  },
  {
    termId: 'co',
    term: 'CO (Carbon Monoxide)',
    definition: 'A gaseous pollutant tracked as a separate overlay, measured in µg/m³.',
    definitionKo: '별도 오버레이로 추적하는 기체 오염물질로, µg/m³ 단위로 측정합니다.',
    example: '"CO" is one of the pollutant overlays available alongside PM2.5, PM10, NO2, O3, and SO2.',
    relations: [{ type: 'isA', target: 'overlay' }],
    align: { qudt: QUDT_UGM3, epaAqs: '42101' },
    unit: QUDT_UGM3,
    natureTag: 'method',
  },
  {
    termId: 'synthetic-control',
    term: 'Synthetic control',
    definition:
      "The statistically constructed counterfactual an SDID analysis compares a treated area against — a weighted blend of untreated areas built to track the treated area's pre-policy trend as closely as possible.",
    definitionKo:
      'SDID 분석에서 정책이 적용된 지역과 비교하는, 통계적으로 구성된 반사실적 비교군입니다 — 정책 시행 이전 추세를 최대한 비슷하게 따라가도록 가중치를 부여해 구성한, 정책이 적용되지 않은 지역들의 조합입니다.',
    example: 'The dashed line in an SDID chart is the synthetic control; the solid line is the treated area’s actual PM2.5.',
    methodRef: 'sdid',
    relations: [
      { type: 'partOf', target: 'sdid' },
      { type: 'seeAlso', target: 'att' },
    ],
    natureTag: 'method',
  },
  {
    termId: 'feed',
    term: 'Feed',
    definition:
      'A single collected data artifact — for example the pollutant grid or the fire-hotspot list — that one or more overlays or phenomena share as their source.',
    definitionKo:
      '예를 들어 오염물질 격자나 화재 핫스팟 목록처럼, 하나 이상의 오버레이나 현상이 공유하는 단일 수집 데이터 산출물입니다.',
    example: 'PM2.5 and PM10 overlays both read from the same aq-grid feed.',
    relations: [
      { type: 'partOf', target: 'overlay' },
      { type: 'seeAlso', target: 'freshness' },
      { type: 'seeAlso', target: 'station' },
    ],
    natureTag: 'method',
  },
  {
    termId: 'station',
    term: 'Station',
    definition:
      "A fixed ground location hosting one or more air-quality or weather sensors — the source of an observed value, and one input to a value's coverage and source-tier.",
    definitionKo:
      '하나 이상의 대기질·기상 센서를 갖춘 고정 지상 지점입니다 — observed 값의 출처이며, 커버리지와 source-tier를 구성하는 요소이기도 합니다.',
    example: 'A city with three stations nearby has higher coverage than a city with none.',
    methodRef: 'grid-vs-station',
    relations: [
      { type: 'measures', target: 'pm25' },
      { type: 'seeAlso', target: 'observed' },
      { type: 'seeAlso', target: 'coverage' },
      { type: 'seeAlso', target: 'source-tier' },
    ],
    align: { sosa: 'http://www.w3.org/ns/sosa/Sensor' },
    natureTag: 'method',
  },
  {
    termId: 'grid-cell',
    term: 'Grid cell',
    definition:
      'An area on the map assigned a value even though no station sits inside it — built by interpolating, blending, or satellite-deriving from whatever nearby evidence exists, so the map stays continuous instead of showing gaps.',
    definitionKo:
      '관측소가 없는 지역이라도 값을 할당한 지도상의 구역입니다 — 지도가 빈 곳 없이 이어지도록, 주변에 있는 근거를 보간·혼합·위성 추정해 구성합니다.',
    example: 'A grid cell over open ocean has no station in it; its value is interpolated or satellite-derived instead.',
    methodRef: 'grid-vs-station',
    relations: [
      { type: 'contrastsWith', target: 'station' },
      { type: 'seeAlso', target: 'interpolated' },
      { type: 'seeAlso', target: 'coverage' },
    ],
    natureTag: 'method',
  },
  {
    termId: 'averaging-window',
    term: 'Averaging window',
    definition:
      'The time span a displayed value represents — for example an hourly reading versus a rolling 24-hour average. Short and long windows answer different questions and can look calmer or spikier for the same underlying event.',
    definitionKo:
      '표시된 값이 나타내는 시간 범위입니다 — 예를 들어 시간당 측정값인지 24시간 이동평균인지가 여기 해당합니다. 짧은 창과 긴 창은 서로 다른 질문에 답하며, 같은 사건이라도 다르게 보일 수 있습니다.',
    example: 'A rolling 24-hour average can look calmer than any single hour actually was.',
    methodRef: 'averaging-windows',
    relations: [{ type: 'seeAlso', target: 'nature' }],
    natureTag: 'method',
  },
  {
    termId: 'overlay',
    term: 'Overlay',
    definition:
      'A single phenomenon that can be picked and rendered on the Globe as its own layer — for example PM2.5, wind, or ozone — each with its own feed, color scale, and legend.',
    definitionKo:
      '지구본 화면에서 하나의 레이어로 선택해 표시할 수 있는 개별 현상입니다 — 예를 들어 PM2.5, 바람, 오존이 있으며 각각 고유한 피드·색상 스케일·범례를 가집니다.',
    example: 'Switching the overlay picker from "PM2.5" to "Wind" changes which feed and legend the Globe renders.',
    relations: [
      { type: 'seeAlso', target: 'feed' },
      { type: 'seeAlso', target: 'grid-cell' },
    ],
    align: { sosa: 'http://www.w3.org/ns/sosa/ObservableProperty' },
    natureTag: 'method',
  },
  {
    termId: 'wind-field',
    term: 'Wind field',
    definition:
      'The vector wind overlay — speed and direction rendered as moving particles across the globe, collected at a small set of pressure levels rather than everywhere at once.',
    definitionKo:
      '지구본 위에서 움직이는 입자로 표현되는 바람 오버레이(풍속·풍향)입니다 — 전 고도가 아니라 일부 기압면에서만 수집합니다.',
    example: 'The wind-field overlay shows a small set of collected pressure levels, not every altitude at once.',
    relations: [
      { type: 'isA', target: 'overlay' },
      { type: 'seeAlso', target: 'grid-cell' },
    ],
    natureTag: 'method',
  },
  {
    termId: 'pollen',
    term: 'Pollen',
    definition:
      'A group of overlays (grass, birch, alder, mugwort, and related species) tracking airborne pollen concentration, currently collected only for Europe.',
    definitionKo:
      '잔디·자작나무·오리나무·쑥 등 종별 공중 꽃가루 농도를 추적하는 오버레이 그룹으로, 현재는 유럽 지역만 수집합니다.',
    example: 'The pollen overlay is grayed out outside its European coverage area rather than showing a fabricated value.',
    relations: [
      { type: 'isA', target: 'overlay' },
      { type: 'contrastsWith', target: 'coverage' },
    ],
    natureTag: 'method',
  },
  {
    termId: 'fire-hotspot',
    term: 'Fire hotspot',
    definition:
      'A detected active-fire location from satellite fire-radiative-power data, rendered on the Globe as an alert-style marker rather than a continuous grid.',
    definitionKo:
      '위성 화재복사강도(FRP) 데이터로 탐지한 활성 산불 지점으로, 연속 격자가 아니라 경보 형태의 마커로 지구본에 표시됩니다.',
    example: 'A cluster of fire hotspots upwind of a city often precedes a smoke-driven PM2.5 spike.',
    relations: [
      { type: 'seeAlso', target: 'smoke' },
      { type: 'seeAlso', target: 'pm25' },
    ],
    natureTag: 'method',
  },
  {
    termId: 'smoke',
    term: 'Smoke',
    definition:
      'A rendered plume showing where smoke is likely moving from an active fire, distinct from the fire-hotspot markers themselves.',
    definitionKo:
      '산불에서 연기가 이동할 것으로 추정되는 경로를 표시하는 레이어로, 화재 지점(fire-hotspot) 마커 자체와는 구분됩니다.',
    example: 'The smoke layer can extend far beyond the fire-hotspot markers that triggered it.',
    relations: [
      { type: 'derivedFrom', target: 'fire-hotspot' },
      { type: 'seeAlso', target: 'pm25' },
    ],
    natureTag: 'method',
  },
]

export function findGlossaryTerm(termId: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find((t) => t.termId === termId)
}

/**
 * Derives the flat related-term-id list from `relations` (O1) — the single
 * source of truth is `relations`; do not hand-author a parallel list.
 * Deduplicates in case a term relates to another via more than one edge type.
 */
export function relatedTermIds(term: GlossaryTerm): string[] {
  return [...new Set(term.relations.map((r) => r.target))]
}
