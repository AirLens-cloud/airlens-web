/**
 * color.ts — OKLab conversion round-trip + perceptual-lerp sanity (AAA).
 */
import { describe, it, expect } from 'vitest';
import { srgbToOklab, oklabToSrgb, oklabLerp } from './color';

const REPRESENTATIVE_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [16, 185, 129],   // PM2.5 good — green
  [37, 226, 244],   // PM2.5 moderate — cyan
  [245, 158, 11],   // PM2.5 USG — amber
  [239, 68, 68],    // PM2.5 unhealthy — red
  [139, 92, 246],   // PM2.5 very unhealthy — purple
  [153, 27, 27],    // PM2.5 hazardous — dark red
  [0, 0, 255],      // pure blue
  [255, 0, 0],      // pure red
  [0, 255, 255],    // pure cyan
  [255, 255, 0],    // pure yellow
  [255, 255, 255],  // white
  [0, 0, 0],        // black
];

function chroma([, a, b]: readonly [number, number, number]): number {
  return Math.sqrt(a * a + b * b);
}

describe('srgbToOklab / oklabToSrgb round trip', () => {
  it('recovers each channel within ±1 for a representative color set', () => {
    // Arrange / Act / Assert
    for (const rgb of REPRESENTATIVE_COLORS) {
      const roundTripped = oklabToSrgb(srgbToOklab(rgb));
      expect(Math.abs(roundTripped[0] - rgb[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTripped[1] - rgb[1])).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTripped[2] - rgb[2])).toBeLessThanOrEqual(1);
    }
  });
});

describe('oklabLerp', () => {
  it('returns the endpoint colors exactly at t=0 and t=1', () => {
    // Arrange
    const a: [number, number, number] = [16, 185, 129];
    const b: [number, number, number] = [37, 226, 244];
    // Act / Assert
    expect(oklabLerp(a, b, 0)).toEqual(a);
    expect(oklabLerp(a, b, 1)).toEqual(b);
  });

  it('de-greys a complementary-hue transition more than a plain sRGB channel lerp', () => {
    // Arrange — red→cyan is the textbook sRGB-lerp "muddy grey midpoint" case: every
    // channel walks straight through 128,128,128 territory because the two colors sum
    // to white per-channel. OKLab's perceptual path keeps chroma up through the middle.
    const red: [number, number, number] = [255, 0, 0];
    const cyan: [number, number, number] = [0, 255, 255];
    const t = 0.5;
    // Act
    const srgbMid: [number, number, number] = [
      Math.round(red[0] + (cyan[0] - red[0]) * t),
      Math.round(red[1] + (cyan[1] - red[1]) * t),
      Math.round(red[2] + (cyan[2] - red[2]) * t),
    ];
    const oklabMid = oklabLerp(red, cyan, t);
    // Assert
    expect(chroma(srgbToOklab(oklabMid))).toBeGreaterThan(chroma(srgbToOklab(srgbMid)));
  });
});

// The PM2.5 green(#10b981)→cyan(#25e2f4) band chroma proof lives in idwCore.test.ts
// (`valueToRgb — threshold color invariance`) — it exercises the production cached path
// (idwCore.ts's getOklabStops) rather than duplicating the same assertion against this
// lower-level module.
