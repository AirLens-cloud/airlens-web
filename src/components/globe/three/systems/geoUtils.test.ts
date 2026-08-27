/**
 * geoUtils — vec3ToLatLon round-trip tests (AAA).
 */
import { describe, it, expect } from 'vitest';
import { latLonToVec3, vec3ToLatLon } from './geoUtils';

const CASES: Array<{ label: string; lat: number; lon: number }> = [
  { label: '(0, 0)', lat: 0, lon: 0 },
  { label: '(45, 90)', lat: 45, lon: 90 },
  { label: '(-60, -120)', lat: -60, lon: -120 },
  { label: '(89, 179.5)', lat: 89, lon: 179.5 },
];

describe('vec3ToLatLon (inverse of latLonToVec3)', () => {
  for (const { label, lat, lon } of CASES) {
    it(`round-trips ${label} within 1e-6 degrees`, () => {
      // Arrange
      const v = latLonToVec3(lat, lon, 1.005);
      // Act
      const result = vec3ToLatLon(v);
      // Assert
      expect(result.lat).toBeCloseTo(lat, 6);
      expect(result.lon).toBeCloseTo(lon, 6);
    });
  }
});
