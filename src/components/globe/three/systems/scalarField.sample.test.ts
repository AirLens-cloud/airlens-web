/**
 * scalarField.sample — sampleGrid pure sampler tests (AAA).
 * Synthetic global grid: nLat=181/nLon=360, latMin=-90/lonMin=-180, dLat=dLon=1.
 */
import { describe, it, expect } from 'vitest';
import { sampleGrid } from './scalarField';
import type { OverlayGridData } from '../../../../types/globe';

function buildGrid(): OverlayGridData {
  return {
    values: new Float32Array(181 * 360).fill(NaN),
    nLat: 181,
    nLon: 360,
    latMin: -90,
    lonMin: -180,
    dLat: 1,
    dLon: 1,
    overlayType: 'pm25',
    timestamp: 0,
  };
}

describe('sampleGrid', () => {
  it('reads the exact cell for an in-range lat/lon', () => {
    // Arrange
    const grid = buildGrid();
    const latIdx = Math.round((10 - grid.latMin) / grid.dLat);
    const lonIdx = Math.round((20 - grid.lonMin) / grid.dLon);
    grid.values[latIdx * grid.nLon + lonIdx] = 42.5;
    // Act
    const result = sampleGrid(grid, 10, 20);
    // Assert
    expect(result).toBe(42.5);
  });

  it('wraps longitude 185° to the -175° cell', () => {
    // Arrange
    const grid = buildGrid();
    const latIdx = Math.round((0 - grid.latMin) / grid.dLat);
    const lonIdx = Math.round((-175 - grid.lonMin) / grid.dLon);
    grid.values[latIdx * grid.nLon + lonIdx] = 7.7;
    // Act
    const result = sampleGrid(grid, 0, 185);
    // Assert — Float32Array loses precision vs. the JS number literal
    expect(result).toBeCloseTo(7.7, 5);
  });

  it('returns null for an out-of-range latitude', () => {
    // Arrange
    const grid = buildGrid();
    // Act
    const result = sampleGrid(grid, 95, 0);
    // Assert
    expect(result).toBeNull();
  });

  it('returns null for a missing (NaN) cell', () => {
    // Arrange
    const grid = buildGrid();
    // Act — cell at (-45, 100) was never populated, stays NaN
    const result = sampleGrid(grid, -45, 100);
    // Assert
    expect(result).toBeNull();
  });
});
