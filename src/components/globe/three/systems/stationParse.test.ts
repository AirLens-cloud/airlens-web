/**
 * stationParse — parseStationData pure-function tests (AAA).
 */
import { describe, it, expect } from 'vitest';
import { parseStationData } from './stationParse';

function marker(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    location: { lat: 37.5, lon: 127.0 },
    aqi: 80,
    city: 'Seoul',
    source: 'openaq',
    sensor_type: 'government',
    pm25_p10: 10.2,
    pm25_p90: 34.8,
    station_id: 'kr-seoul-001',
    ...overrides,
  };
}

describe('parseStationData', () => {
  it('passes through Glass-box fields (p10/p90/source/station_id)', () => {
    // Arrange
    const raw = [marker()];
    // Act
    const [station] = parseStationData(raw);
    // Assert
    expect(station.p10).toBe(10.2);
    expect(station.p90).toBe(34.8);
    expect(station.source).toBe('openaq');
    expect(station.stationUid).toBe('kr-seoul-001');
  });

  it('skips markers with aqi <= 0', () => {
    // Arrange
    const raw = [marker({ aqi: 0 }), marker({ aqi: -5 })];
    // Act
    const result = parseStationData(raw);
    // Assert
    expect(result).toHaveLength(0);
  });

  it('skips markers with missing location', () => {
    // Arrange
    const raw = [marker({ location: undefined }), marker({ location: { lon: 127 } })];
    // Act
    const result = parseStationData(raw);
    // Assert
    expect(result).toHaveLength(0);
  });

  it('does not convert a letter DQSS grade — dqss field is absent from output', () => {
    // Arrange
    const raw = [marker({ dqss: 'A' })];
    // Act
    const [station] = parseStationData(raw);
    // Assert
    expect(station).not.toHaveProperty('dqss');
  });
});
