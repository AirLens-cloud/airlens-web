import { describe, it, expect } from 'vitest';
import { buildBorderIndex, findSelectedRange, type BorderFeatureRange } from './borderIndex';

const RANGES: BorderFeatureRange[] = [
  { name: 'South Korea', id: '410', start: 0, count: 8 },
  { name: 'Indonesia', id: '360', start: 8, count: 24 },
  { name: 'Lesotho', id: '426', start: 32, count: 6 },
];

describe('buildBorderIndex', () => {
  it('covers every vertex when nothing is excluded', () => {
    // Arrange
    const vertexCount = 38;

    // Act
    const index = buildBorderIndex(vertexCount, null);

    // Assert
    expect(index).toHaveLength(vertexCount);
    expect(index[0]).toBe(0);
    expect(index[vertexCount - 1]).toBe(vertexCount - 1);
  });

  it('skips exactly the excluded range and keeps order', () => {
    // Arrange
    const vertexCount = 38;
    const excluded = RANGES[1]; // Indonesia [8, 32)

    // Act
    const index = buildBorderIndex(vertexCount, excluded);

    // Assert
    expect(index).toHaveLength(vertexCount - excluded.count);
    expect(Array.from(index)).toEqual([
      ...Array.from({ length: 8 }, (_, i) => i),
      ...Array.from({ length: 6 }, (_, i) => 32 + i),
    ]);
  });

  it('preserves LineSegments pairing (even length) for even-count ranges', () => {
    // Arrange — every feature contributes segment pairs, so counts are even
    const vertexCount = 38;

    // Act
    const index = buildBorderIndex(vertexCount, RANGES[2]);

    // Assert
    expect(index.length % 2).toBe(0);
  });

  it('handles an excluded range spanning the whole buffer', () => {
    // Arrange
    const vertexCount = 10;

    // Act
    const index = buildBorderIndex(vertexCount, { start: 0, count: 10 });

    // Assert
    expect(index).toHaveLength(0);
  });
});

describe('findSelectedRange', () => {
  it('matches by feature name', () => {
    // Arrange
    const selected = { name: 'Indonesia', code: 'IDN' };

    // Act
    const range = findSelectedRange(RANGES, selected);

    // Assert
    expect(range).toBe(RANGES[1]);
  });

  it('matches by numeric feature id when the name differs', () => {
    // Arrange — dataset name drift ("Korea, Rep.") falls back to id === code
    const selected = { name: 'Korea, Rep.', code: '410' };

    // Act
    const range = findSelectedRange(RANGES, selected);

    // Assert
    expect(range).toBe(RANGES[0]);
  });

  it('returns null for no selection or no match', () => {
    // Arrange / Act / Assert
    expect(findSelectedRange(RANGES, null)).toBeNull();
    expect(findSelectedRange(RANGES, { name: 'Atlantis', code: '999' })).toBeNull();
  });
});
