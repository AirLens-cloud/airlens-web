import { describe, it, expect } from 'vitest';
import { nearestCityPrediction, CITY_PREDICTION_MAX_DISTANCE_KM } from './nearestCityPrediction';
import type { CityPrediction } from '../../types/ml';

function pred(name: string, lat: number, lon: number): CityPrediction {
  return { name, lat, lon, predicted_p10: 10, predicted_p50: 15, predicted_p90: 20 };
}

describe('nearestCityPrediction', () => {
  it('picks the geographically nearest prediction row', () => {
    // Arrange
    const rows = [pred('Seoul', 37.5665, 126.978), pred('Busan', 35.1796, 129.0756)];
    // Act
    const match = nearestCityPrediction(rows, 37.5, 127.0);
    // Assert
    expect(match?.prediction.name).toBe('Seoul');
  });

  it('returns null when coords are missing', () => {
    // Arrange
    const rows = [pred('Seoul', 37.5665, 126.978)];
    // Act
    const match = nearestCityPrediction(rows, null, undefined);
    // Assert
    expect(match).toBeNull();
  });

  it('returns null when no predictions supplied', () => {
    // Arrange / Act
    const match = nearestCityPrediction([], 37.5, 127.0);
    // Assert
    expect(match).toBeNull();
  });

  it('degrades to null when the nearest match is beyond maxDistanceKm (no fabricated pick)', () => {
    // Arrange — Seoul vs a point ~1000km away (well beyond the 300km default gate)
    const rows = [pred('FarCity', 30.0, 100.0)];
    // Act
    const match = nearestCityPrediction(rows, 37.5665, 126.978, CITY_PREDICTION_MAX_DISTANCE_KM);
    // Assert
    expect(match).toBeNull();
  });

  it('skips rows with non-finite coords', () => {
    // Arrange
    const rows = [
      { ...pred('Bad', Number.NaN, 127.0) },
      pred('Seoul', 37.5665, 126.978),
    ];
    // Act
    const match = nearestCityPrediction(rows, 37.5, 127.0);
    // Assert
    expect(match?.prediction.name).toBe('Seoul');
  });
});
