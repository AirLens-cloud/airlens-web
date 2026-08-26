/**
 * predictionParse — CityPrediction → PredictionMarker (pure, testable).
 *
 * stationParse 와 같은 규약: 좌표를 지구본 표면 Vector3 로 투영하고 Glass-box 필드
 * (p10/p50/p90/source/model_version)를 떨어뜨리지 않고 통과. DQSS 는 만들지 않는다
 * (예측엔 실측 품질점수가 없다 — 프론트는 "DQSS —" 정직 표기).
 */
import { latLonToVec3 } from './geoUtils';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';
import type { CityPrediction } from '../../../../types/ml';
import type { PredictionMarker } from '../../../../types/globe';

const R = GLOBE_CONFIG.ML_PREDICTIONS.GLOBE_R;
const BAND_ALPHA = GLOBE_CONFIG.ML_PREDICTIONS.BAND_ALPHA;

/**
 * p10-p90 밴드 상대폭 → 마커 alpha (넓을수록/불확실성 클수록 흐리게).
 * 3-way: 밴드 부재(비-finite 값, p50<=0, 또는 p10>p90 인 역전 밴드) → DEFAULT — 모르는
 * 것을 "확실함"으로 단정하지 않는다(feedback_null_estimate_falls_into_assertion 정합).
 * 역전 밴드를 걸러내지 않으면 relWidth 가 음수 → clamp(…,0,1) 이 0 으로 깎여
 * alpha=1(가장 확실)로 읽혀서, 데이터 오류가 "가장 신뢰할 수 있는 예측"으로 둔갑한다.
 * 폭 0 → alpha 1.0(완전 불투명). REL_WIDTH_FULL 이상 → MIN(마커가 사라지진 않는 판독성 하한).
 */
export function bandRelWidthToAlpha(
  p10: number | null | undefined,
  p50: number | null | undefined,
  p90: number | null | undefined,
): number {
  if (
    typeof p10 !== 'number' || typeof p50 !== 'number' || typeof p90 !== 'number' ||
    !Number.isFinite(p10) || !Number.isFinite(p50) || !Number.isFinite(p90) ||
    !(p50 > 0) || p10 > p90
  ) {
    return BAND_ALPHA.DEFAULT;
  }
  const relWidth = (p90 - p10) / p50;
  const t = Math.min(Math.max(relWidth / BAND_ALPHA.REL_WIDTH_FULL, 0), 1);
  return 1 - t * (1 - BAND_ALPHA.MIN);
}

export function parsePredictionData(rows: CityPrediction[]): PredictionMarker[] {
  const results: PredictionMarker[] = [];
  for (const p of rows) {
    results.push({
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      p50: p.predicted_p50,
      p10: p.predicted_p10,
      p90: p.predicted_p90,
      position: latLonToVec3(p.lat, p.lon, R),
      source: p.source,
      modelVersion: p.model_version,
      observedPm25: p.observed_pm25 ?? null,
      confidenceGrade: p.confidence_grade ?? null,
    });
  }
  return results;
}
