/**
 * windTrails — WIND_TRAILS tier config invariants (AAA).
 *
 * Guards the P4b tier-adaptive trail length: useFrame cost scales with
 * count × length, so every tier must define a length and low-end tiers
 * must not exceed the high tier's history depth.
 */
import { describe, it, expect } from 'vitest';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';

const { TRAIL_COUNTS, TRAIL_LENGTHS } = GLOBE_CONFIG.GLOBE_V2.WIND_TRAILS;

describe('WIND_TRAILS.TRAIL_LENGTHS', () => {
  it('defines a positive integer length for every tier', () => {
    // Arrange
    const tiers = Object.keys(TRAIL_LENGTHS) as Array<keyof typeof TRAIL_LENGTHS>;
    // Act & Assert
    for (const tier of tiers) {
      const len = TRAIL_LENGTHS[tier];
      expect(Number.isInteger(len)).toBe(true);
      expect(len).toBeGreaterThan(0);
    }
  });

  it('is monotonic: low <= medium <= high', () => {
    // Arrange
    const { low, medium, high } = TRAIL_LENGTHS;
    // Act & Assert
    expect(low).toBeLessThanOrEqual(medium);
    expect(medium).toBeLessThanOrEqual(high);
  });

  it('preserves the high tier at 80 (existing visual result unchanged)', () => {
    // Arrange & Act
    const { high } = TRAIL_LENGTHS;
    // Assert
    expect(high).toBe(80);
  });

  it('shares the same tier key set as TRAIL_COUNTS (no missing tier)', () => {
    // Arrange
    const countTiers = Object.keys(TRAIL_COUNTS).sort();
    const lengthTiers = Object.keys(TRAIL_LENGTHS).sort();
    // Act & Assert
    expect(lengthTiers).toEqual(countTiers);
  });
});
