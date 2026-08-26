/**
 * windTexture encode bounds (AAA).
 *
 * The DataTexture is the only contract between the wind field and both
 * advection paths (CPU advectStep / GPU compute shader), and it is FloatType —
 * an out-of-range u/v is not saturated by the format, it survives the round
 * trip and decodes as an out-of-scale velocity that jumps the particle across
 * the globe. Jet-stream cells legitimately exceed the ±100 m/s encode scale,
 * so these tests pin that encoding clamps rather than overflows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';

const { WIND_TEXTURE } = GLOBE_CONFIG.GLOBE_V2;

/** Stub WindField returning one constant (u, v) everywhere. */
function constantField(u: number, v: number) {
  return {
    interpolate: () => ({ u, v }),
    meta: { level: 'surface', refTime: '', generatedAt: '', resolution: 1 },
  };
}

const fetchWindField = vi.fn();

vi.mock('../../../../api/weather', () => ({
  fetchWindField: (...args: unknown[]) => fetchWindField(...args),
}));

/** Fresh module instance — getWindDataTexture caches per level module-wide. */
async function encode(u: number, v: number): Promise<Float32Array> {
  vi.resetModules();
  fetchWindField.mockResolvedValue(constantField(u, v));
  const { getWindDataTexture } = await import('./windTexture');
  const texture = await getWindDataTexture('surface');
  expect(texture).not.toBeNull();
  return texture!.image.data as Float32Array;
}

beforeEach(() => {
  fetchWindField.mockReset();
});

describe('clampToScale', () => {
  it('passes through components inside the encodable range', async () => {
    // Arrange & Act
    const { clampToScale } = await import('./windTexture');
    // Assert
    expect(clampToScale(0)).toBe(0);
    expect(clampToScale(42.5)).toBe(42.5);
    expect(clampToScale(-42.5)).toBe(-42.5);
  });

  it('clamps beyond the scale bounds in both directions', async () => {
    // Arrange & Act
    const { clampToScale } = await import('./windTexture');
    // Assert
    expect(clampToScale(150)).toBe(WIND_TEXTURE.SCALE_MAX);
    expect(clampToScale(-150)).toBe(WIND_TEXTURE.SCALE_MIN);
  });
});

describe('getWindDataTexture encode bounds', () => {
  it('encodes an in-range wind to the expected normalized texel', async () => {
    // Arrange — +50 m/s zonal on a ±100 scale sits at 3/4 of the range
    const data = await encode(50, 0);
    // Act & Assert (R = u, G = v)
    expect(data[0]).toBeCloseTo(0.75, 6);
    expect(data[1]).toBeCloseTo(0.5, 6);
  });

  it('saturates a jet-stream-strength wind at the range edge instead of overflowing', async () => {
    // Arrange — 150 m/s exceeds SCALE_MAX; unclamped this normalizes to 1.25
    const data = await encode(150, -150);
    // Act & Assert
    expect(data[0]).toBe(1);
    expect(data[1]).toBe(0);
  });

  it('keeps every texel inside [0,1] for an out-of-scale field', async () => {
    // Arrange — the property that bounds both decode paths
    const data = await encode(240, -240);
    // Act — inspect the u/v channels of every texel
    let outOfRange = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 0 || data[i] > 1 || data[i + 1] < 0 || data[i + 1] > 1) outOfRange++;
    }
    // Assert
    expect(data.length).toBe(WIND_TEXTURE.WIDTH * WIND_TEXTURE.HEIGHT * 4);
    expect(outOfRange).toBe(0);
  });

  it('derives the speed channel from the clamped components', async () => {
    // Arrange — speed must reflect what advection will actually decode
    const data = await encode(150, 0);
    // Act & Assert — clamped |u| = SCALE_MAX ⇒ speed channel = 1.0, not 1.5
    expect(data[2]).toBeCloseTo(1, 6);
  });
});
