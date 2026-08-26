/**
 * pollutionTexture — DataTexture bake invariants (AAA).
 */
import { describe, it, expect } from 'vitest';
import { buildPollutionTexture } from './pollutionTexture';
import type { PollutionSource } from '../../../../types/globe';

describe('buildPollutionTexture', () => {
  it('produces a texture sized width*height*4 (RGBA)', () => {
    // Arrange
    const sources: PollutionSource[] = [{ lat: 37, lon: 127, pm25: 150 }];
    // Act
    const tex = buildPollutionTexture(sources, 8, 4);
    // Assert
    // three's DataTexture types `image.data` as nullable; the bake always fills
    // it, so narrow the same way the sibling assertions below already do.
    expect((tex.image.data as Float32Array).length).toBe(8 * 4 * 4);
  });

  it('is all-zero R channel when no pollution sources exist', () => {
    // Arrange & Act
    const tex = buildPollutionTexture([], 8, 4);
    const data = tex.image.data as Float32Array;
    // Assert
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(0);
    }
  });

  it('every value stays within [0, 1]', () => {
    // Arrange
    const sources: PollutionSource[] = [
      { lat: 37, lon: 127, pm25: 300 },
      { lat: -10, lon: -50, pm25: 80 },
    ];
    // Act
    const tex = buildPollutionTexture(sources, 36, 18);
    const data = tex.image.data as Float32Array;
    // Assert
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(1);
    }
  });

  it('peaks near the source cell and fades with distance', () => {
    // Arrange — single hot source at (0, 0), high pm25
    const sources: PollutionSource[] = [{ lat: 0, lon: 0, pm25: 300 }];
    const width = 360;
    const height = 180;
    // Act
    const tex = buildPollutionTexture(sources, width, height);
    const data = tex.image.data as Float32Array;
    const idxAt = (lat: number, lon: number) => {
      const y = Math.round(((90 - lat) / 180) * height);
      const x = Math.round(((lon + 180) / 360) * width);
      return (Math.min(y, height - 1) * width + Math.min(x, width - 1)) * 4;
    };
    const near = data[idxAt(0, 0)];
    const far = data[idxAt(0, 90)];
    // Assert
    expect(near).toBeGreaterThan(0);
    expect(far).toBe(0);
  });

  it('sets non-R channels to the documented constant (0, 0, 1)', () => {
    // Arrange & Act
    const tex = buildPollutionTexture([{ lat: 0, lon: 0, pm25: 100 }], 4, 2);
    const data = tex.image.data as Float32Array;
    // Assert
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i + 1]).toBe(0);
      expect(data[i + 2]).toBe(0);
      expect(data[i + 3]).toBe(1);
    }
  });
});
