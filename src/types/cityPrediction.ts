// types/cityPrediction.ts — useCityPrediction hook 도메인 타입.
// CityPrediction(원본 예측 row)은 types/ml.ts SOT — 여기는 hook 반환 shape 전용.

import type { CityPrediction } from './ml';

export type CityPredictionStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface UseCityPredictionResult {
  status: CityPredictionStatus;
  /** 좌표에 가장 가까운 예측 row. status !== 'ready' 이면 null. */
  prediction: CityPrediction | null;
  /** 요청 좌표 → 매치된 예측 지점까지 거리(km). 미매치/좌표 없음이면 null. */
  distanceKm: number | null;
}
