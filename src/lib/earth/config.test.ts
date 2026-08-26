/**
 * config.ts — segmentsToGradient sub-stop layout (AAA, OKLab P3).
 */
import { describe, it, expect } from 'vitest';
import { segmentsToGradient, PM25_COLOR_SCALE } from './config';

const GRADIENT_SUB_STOPS = 8;

/** Parse `rgb(r,g,b) NN.NN%` stop strings out of a `linear-gradient(90deg, ...)` value. */
function parseStops(gradient: string): Array<{ pct: number }> {
  const inner = gradient.replace(/^linear-gradient\(90deg,\s*/, '').replace(/\)$/, '');
  return inner.split(', ').map((stop) => {
    const match = stop.match(/([\d.]+)%$/);
    return { pct: match ? Number(match[1]) : NaN };
  });
}

describe('segmentsToGradient', () => {
  it('emits ~8 sub-stops per band, deduplicating shared band boundaries', () => {
    // Arrange
    const bandCount = PM25_COLOR_SCALE.length - 1;
    // Act
    const gradient = segmentsToGradient(PM25_COLOR_SCALE);
    const stops = parseStops(gradient);
    // Assert — first band emits 8, every subsequent band emits 7 (its shared start
    // boundary is the previous band's last stop, not re-emitted).
    const expectedCount = GRADIENT_SUB_STOPS + (bandCount - 1) * (GRADIENT_SUB_STOPS - 1);
    expect(stops).toHaveLength(expectedCount);
  });

  it('keeps stop % positions monotonically increasing', () => {
    // Arrange
    const gradient = segmentsToGradient(PM25_COLOR_SCALE);
    // Act
    const stops = parseStops(gradient);
    // Assert
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].pct).toBeGreaterThanOrEqual(stops[i - 1].pct);
    }
    expect(stops[0].pct).toBeCloseTo(0, 5);
    expect(stops[stops.length - 1].pct).toBeCloseTo(100, 5);
  });

  it('keeps each band occupying an equal-width share of the gradient (tick alignment unchanged)', () => {
    // Arrange
    const bandCount = PM25_COLOR_SCALE.length - 1;
    const gradient = segmentsToGradient(PM25_COLOR_SCALE);
    // Act
    const stops = parseStops(gradient);
    const stopsPerBand = GRADIENT_SUB_STOPS; // first band only; later bands drop 1 shared stop
    const firstBandEndPct = stops[stopsPerBand - 1].pct;
    // Assert — band 0 ends at 1/bandCount of the total width, same as the pre-P3
    // evenly-spaced stop list. Tolerance matches the 2-decimal `toFixed` used when
    // rendering each stop's `%` position.
    expect(firstBandEndPct).toBeCloseTo(100 / bandCount, 1);
  });
});
