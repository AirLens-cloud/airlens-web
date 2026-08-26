import { useEffect, useState } from 'react';
import { fetchCityPredictionsResult } from '../api/predictions';
import { nearestCityPrediction, CITY_PREDICTION_MAX_DISTANCE_KM } from '../lib/predictions/nearestCityPrediction';
import type { UseCityPredictionResult } from '../types/cityPrediction';

const INITIAL: UseCityPredictionResult = { status: 'loading', prediction: null, distanceKm: null };
const ERROR: UseCityPredictionResult = { status: 'error', prediction: null, distanceKm: null };
const EMPTY: UseCityPredictionResult = { status: 'empty', prediction: null, distanceKm: null };

/**
 * useCityPrediction — resolves the self-ML (AODtoPM25Model v2) grid prediction
 * nearest to (lat, lon) from the static `grid_latest.json` snapshot.
 *
 * Honest by construction: a fetch/parse failure surfaces as `status: 'error'`
 * (design-taxonomy §5 — silent-suppress-to-empty is banned); no coords or a
 * successful response with no nearby coverage (beyond `maxDistanceKm`)
 * surfaces as `status: 'empty'`. Never a fabricated pick either way.
 */
export function useCityPrediction(
  lat: number | null | undefined,
  lon: number | null | undefined,
  maxDistanceKm: number = CITY_PREDICTION_MAX_DISTANCE_KM,
): UseCityPredictionResult {
  const [result, setResult] = useState<UseCityPredictionResult>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    fetchCityPredictionsResult()
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setResult(ERROR);
          return;
        }
        const match = nearestCityPrediction(res.data, lat, lon, maxDistanceKm);
        setResult(
          match
            ? { status: 'ready', prediction: match.prediction, distanceKm: match.distanceKm }
            : EMPTY,
        );
      })
      .catch(() => {
        if (!cancelled) setResult(ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, maxDistanceKm]);

  return result;
}
