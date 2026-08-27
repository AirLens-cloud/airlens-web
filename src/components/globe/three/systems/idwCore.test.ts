/**
 * idwCore — buildIdwField / valueToRgb pure function tests (AAA).
 * Synthetic 2-stop scale: blue(0) → red(100). Small 8×4 grid for fast assertions.
 */
import { describe, it, expect } from 'vitest';
import { buildIdwField, valueToRgb, densityAlphaFactor } from './idwCore';
import {
  PM25_COLOR_SCALE, TEMP_COLOR_SCALE, RH_COLOR_SCALE, NO2_COLOR_SCALE, O3_COLOR_SCALE,
  CO_COLOR_SCALE, SST_COLOR_SCALE, SSTA_COLOR_SCALE, WAVES_COLOR_SCALE,
  CURRENTS_COLOR_SCALE, POLLEN_COLOR_SCALE,
} from '../../../../lib/earth/config';
import { srgbToOklab } from '../../../../lib/earth/color';
import type { ColorSegments, IdwStationPt, IdwParams } from '../../../../types/globe';

const SCALE: ColorSegments = [
  [0, [0, 0, 255]],
  [100, [255, 0, 0]],
];

const PARAMS: IdwParams = {
  power: 2,
  maxDistDeg: 15,
  alphaMax: 0.85,
  alphaBase: 0.22,
  alphaDivisor: 130,
  densityFullDeg: 3,
  densityFadeDeg: 12,
  densityAlphaMin: 0.65,
};

const W = 8;
const H = 4;

/** lat/lon of pixel (x,y) under the equirectangular mapping used by buildIdwField. */
function pixelLatLon(x: number, y: number): { lat: number; lon: number } {
  return { lat: 90 - (y / H) * 180, lon: (x / W) * 360 - 180 };
}

describe('buildIdwField', () => {
  it('renders the station color at its exact cell (dist < 0.01)', () => {
    // Arrange
    const { lat, lon } = pixelLatLon(2, 1);
    const stations: IdwStationPt[] = [{ lat, lon, value: 100 }];
    // Act
    const pixels = buildIdwField(stations, SCALE, W, H, PARAMS);
    const idx = (1 * W + 2) * 4;
    // Assert — value=100 → top-of-scale red, alpha > 0
    expect(pixels[idx]).toBe(255);
    expect(pixels[idx + 1]).toBe(0);
    expect(pixels[idx + 2]).toBe(0);
    expect(pixels[idx + 3]).toBeGreaterThan(0);
  });

  it('leaves cells fully transparent when every station is beyond maxDistDeg', () => {
    // Arrange — single station near mid-grid, tiny maxDistDeg so the far corner never reaches it
    const stations: IdwStationPt[] = [{ lat: 0, lon: 0, value: 50 }];
    const tightParams: IdwParams = { ...PARAMS, maxDistDeg: 0.5 };
    // Act
    const pixels = buildIdwField(stations, SCALE, W, H, tightParams);
    const farIdx = (0 * W + 0) * 4; // top-left corner (lat=90, lon=-180) — far from (0,0)
    // Assert
    expect(pixels[farIdx + 3]).toBe(0);
  });

  it('is deterministic — identical inputs produce byte-identical output', () => {
    // Arrange
    const stations: IdwStationPt[] = [
      { lat: 10, lon: 20, value: 30 },
      { lat: -15, lon: -40, value: 80 },
    ];
    // Act
    const a = buildIdwField(stations, SCALE, W, H, PARAMS);
    const b = buildIdwField(stations, SCALE, W, H, PARAMS);
    // Assert
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('increases alpha monotonically as the interpolated value increases', () => {
    // Arrange — same station location/params, only the value differs
    const { lat, lon } = pixelLatLon(4, 2);
    const lowStations: IdwStationPt[] = [{ lat, lon, value: 10 }];
    const highStations: IdwStationPt[] = [{ lat, lon, value: 90 }];
    // Act
    const low = buildIdwField(lowStations, SCALE, W, H, PARAMS);
    const high = buildIdwField(highStations, SCALE, W, H, PARAMS);
    const idx = (2 * W + 4) * 4;
    // Assert
    expect(high[idx + 3]).toBeGreaterThan(low[idx + 3]);
  });
});

describe('densityAlphaFactor', () => {
  it('is 1 at or below fullDeg and the floor at or above fadeDeg', () => {
    // Arrange / Act / Assert
    expect(densityAlphaFactor(0, 3, 12, 0.65)).toBe(1);
    expect(densityAlphaFactor(3, 3, 12, 0.65)).toBe(1);
    expect(densityAlphaFactor(12, 3, 12, 0.65)).toBeCloseTo(0.65, 10);
    expect(densityAlphaFactor(99, 3, 12, 0.65)).toBeCloseTo(0.65, 10);
  });

  it('ramps linearly between fullDeg and fadeDeg', () => {
    // Arrange — midpoint of the 3→12 ramp
    // Act
    const mid = densityAlphaFactor(7.5, 3, 12, 0.65);
    // Assert — halfway between 1 and the 0.65 floor
    expect(mid).toBeCloseTo(0.825, 10);
  });

  it('refuses to decay on degenerate or non-finite input rather than guessing', () => {
    // Arrange / Act / Assert — fade ≤ full would divide by zero or invert
    expect(densityAlphaFactor(5, 3, 3, 0.65)).toBe(1);
    expect(densityAlphaFactor(5, 12, 3, 0.65)).toBe(1);
    expect(densityAlphaFactor(Number.NaN, 3, 12, 0.65)).toBe(1);
  });
});

describe('buildIdwField — observation-density confidence decay', () => {
  // 1°-per-pixel grid: pixel (x,y) → lat 90-y, lon x-180. The 8×4 grid above is
  // 45°/px, far too coarse to place stations at controlled sub-maxDistDeg distances.
  const FW = 360;
  const FH = 180;
  const SCALE_MAX = SCALE[SCALE.length - 1][0];
  /** Pixel holding lat 0 / lon 0. */
  const ORIGIN_IDX = (90 * FW + 180) * 4;

  /** The alpha byte buildIdwField must produce for `value` at density factor `factor`. */
  function expectedAlphaByte(value: number, factor: number): number {
    const normalized = Math.abs(value) / SCALE_MAX;
    const valueAlpha = Math.min(
      PARAMS.alphaMax,
      PARAMS.alphaBase + normalized / (PARAMS.alphaDivisor / SCALE_MAX),
    );
    return Math.round(valueAlpha * factor * 255);
  }

  it('keeps factor 1.0 on an exact-match cell even after nearer stations accumulated distance', () => {
    // Arrange — a 0.2° station is visited first and accumulates dSum (weight 25 → dSum 5);
    // the exact-match station then resets wSum to 1. Without the matching dSum reset the
    // cell would read as a 5° mean distance and every observation cell would be poisoned.
    const stations: IdwStationPt[] = [
      { lat: 0, lon: 0.2, value: 10 },
      { lat: 0, lon: 0, value: 100 },
    ];
    // Act
    const pixels = buildIdwField(stations, SCALE, FW, FH, PARAMS);
    // Assert — undecayed alpha for value 100 (saturates at alphaMax)
    expect(pixels[ORIGIN_IDX + 3]).toBe(expectedAlphaByte(100, 1));
  });

  it('draws a cell fainter when the same value comes from a more distant observation', () => {
    // Arrange — one station only, so the interpolated value is exactly 50 at every
    // cell regardless of distance. Only the density channel can differ.
    const stations: IdwStationPt[] = [{ lat: 0, lon: 0, value: 50 }];
    // Act
    const pixels = buildIdwField(stations, SCALE, FW, FH, PARAMS);
    const near = pixels[(90 * FW + 181) * 4 + 3]; // 1° away — inside the no-decay plateau
    const far = pixels[(90 * FW + 190) * 4 + 3]; // 10° away — mid-ramp
    // Assert
    expect(near).toBe(expectedAlphaByte(50, 1));
    expect(far).toBeLessThan(near);
    expect(far).toBe(expectedAlphaByte(50, densityAlphaFactor(10, 3, 12, PARAMS.densityAlphaMin)));
  });

  it('never decays below densityAlphaMin, and never to invisible', () => {
    // Arrange — 14° away: past fadeDeg (12) but still inside maxDistDeg (15)
    const stations: IdwStationPt[] = [{ lat: 0, lon: 0, value: 50 }];
    // Act
    const pixels = buildIdwField(stations, SCALE, FW, FH, PARAMS);
    const sparse = pixels[(90 * FW + 194) * 4 + 3];
    // Assert
    expect(sparse).toBe(expectedAlphaByte(50, PARAMS.densityAlphaMin));
    expect(sparse).toBeGreaterThan(0);
  });

  it('applies the decay to saturated cells too (clamp-before-multiply contract)', () => {
    // Arrange — value 200 drives raw alpha to ~1.76, well past alphaMax. Multiplying
    // before clamping would leave this cell at alphaMax, exempting exactly the
    // hazardous concentrations from the confidence signal.
    const stations: IdwStationPt[] = [{ lat: 0, lon: 0, value: 200 }];
    // Act
    const pixels = buildIdwField(stations, SCALE, FW, FH, PARAMS);
    const sparse = pixels[(90 * FW + 194) * 4 + 3]; // 14° away → floor factor
    // Assert
    expect(sparse).toBe(Math.round(PARAMS.alphaMax * PARAMS.densityAlphaMin * 255));
    expect(sparse).toBeLessThan(Math.round(PARAMS.alphaMax * 255));
  });

  it('changes only alpha — the color channels are untouched by density', () => {
    // Arrange
    const stations: IdwStationPt[] = [{ lat: 0, lon: 0, value: 50 }];
    // Act
    const pixels = buildIdwField(stations, SCALE, FW, FH, PARAMS);
    const nearIdx = (90 * FW + 181) * 4;
    const farIdx = (90 * FW + 194) * 4;
    // Assert
    expect([pixels[nearIdx], pixels[nearIdx + 1], pixels[nearIdx + 2]])
      .toEqual([pixels[farIdx], pixels[farIdx + 1], pixels[farIdx + 2]]);
    expect(pixels[farIdx + 3]).toBeLessThan(pixels[nearIdx + 3]);
  });

  it('preserves value-monotonic alpha in the decayed region, not just on station cells', () => {
    // Arrange — the original monotonicity test sits on an exact-match cell, where the
    // factor is always 1. This re-asserts it where the factor is genuinely < 1.
    const low: IdwStationPt[] = [{ lat: 0, lon: 0, value: 10 }];
    const high: IdwStationPt[] = [{ lat: 0, lon: 0, value: 90 }];
    // Act
    const lowPx = buildIdwField(low, SCALE, FW, FH, PARAMS);
    const highPx = buildIdwField(high, SCALE, FW, FH, PARAMS);
    const idx = (90 * FW + 190) * 4 + 3; // 10° away — mid-ramp for both
    // Assert
    expect(highPx[idx]).toBeGreaterThan(lowPx[idx]);
  });

  it('does not decay at all when maxDistDeg is tighter than densityFullDeg', () => {
    // Arrange — support radius 2° collapses the 3→12 ramp; a ramp that can never be
    // entered must be a no-op rather than a divide-by-zero or a blanket fade.
    const stations: IdwStationPt[] = [{ lat: 0, lon: 0, value: 50 }];
    const tight: IdwParams = { ...PARAMS, maxDistDeg: 2 };
    // Act
    const pixels = buildIdwField(stations, SCALE, FW, FH, tight);
    // Assert — 1° away, undecayed
    expect(pixels[(90 * FW + 181) * 4 + 3]).toBe(expectedAlphaByte(50, 1));
  });
});

describe('buildIdwField — geographic distance correction (PR-A A-1)', () => {
  it('colors a cell just across the date line from a station 0.02° from the antimeridian', () => {
    // Arrange — station at lon 179.98, query cell at lon -179.98: true angular gap
    // is 0.04°, but a naive `lon - lon` subtraction sees ~359.96° (weight lost).
    const wideW = 720; // 0.5° per pixel — resolves the ±180° boundary precisely
    const rowH = 4;
    const stations: IdwStationPt[] = [{ lat: 0, lon: 179.98, value: 100 }];
    const params: IdwParams = { ...PARAMS, maxDistDeg: 1 };
    // Act
    const pixels = buildIdwField(stations, SCALE, wideW, rowH, params);
    const idx = (2 * wideW + 0) * 4; // y=2 → lat=0, x=0 → lon=-180 (0.02° from the station)
    // Assert — pre-fix this cell was ~360° from the station (alpha 0); post-fix
    // it's ~0.02° away and gets colored.
    expect(pixels[idx + 3]).toBeGreaterThan(0);
  });

  it('gives a longitude offset at high latitude more IDW weight than the same raw offset would earn at the equator (cos(lat) correction)', () => {
    // Arrange — cell at (80, 0). Station A sits 20° of longitude away (same lat,
    // so dLat=0); station B sits 20° of *latitude* away (dLon=0, never cos-scaled).
    // Before the fix both read as literal 20° and split the blend evenly (val=50).
    // After the fix, A's 20° of longitude collapses to ~3.47° near the pole
    // (20 * cos(80°)) while B's 20° of latitude is untouched — A dominates.
    const stations: IdwStationPt[] = [
      { lat: 80, lon: 20, value: 100 },
      { lat: 60, lon: 0, value: 0 },
    ];
    const params: IdwParams = { ...PARAMS, maxDistDeg: 30 };
    const w = 4;
    const h = 18; // lat step = 180/18 = 10° — lands exactly on lat=80 at y=1
    // Act
    const pixels = buildIdwField(stations, SCALE, w, h, params);
    const cellIdx = (1 * w + 2) * 4; // y=1 → lat=80, x=2 → lon = (2/4)*360-180 = 0
    // Assert — a 50/50 blend renders [140, 83, 162] (documented above); the
    // cos-corrected blend should be pulled hard toward station A's red (255,0,0).
    expect(pixels[cellIdx]).toBeGreaterThan(140);
  });
});

describe('valueToRgb', () => {
  it('clamps to the first stop color at or below the minimum threshold', () => {
    expect(valueToRgb(-5, SCALE)).toEqual([0, 0, 255]);
  });

  it('clamps to the last stop color at or above the maximum threshold', () => {
    expect(valueToRgb(150, SCALE)).toEqual([255, 0, 0]);
  });

  it('interpolates between stops at the midpoint through OKLab (2026-07 P3)', () => {
    // A plain per-channel sRGB lerp would give [128, 0, 128] — the straight RGB-cube
    // line between blue and red. This scale's mid-band interpolation was moved from
    // sRGB channel lerp to OKLab lerp (see idwCore.ts `getOklabStops`/`valueToRgb`) so
    // hue-opposite transitions don't dip through a muddy grey; [128,0,128] is no longer
    // the expected output even though the endpoints (asserted above) are unchanged.
    expect(valueToRgb(50, SCALE)).toEqual([140, 83, 162]);
  });
});

describe('valueToRgb — threshold color invariance (OKLab P3)', () => {
  const ALL_PRODUCTION_SCALES: ReadonlyArray<readonly [string, ColorSegments]> = [
    ['PM25', PM25_COLOR_SCALE],
    ['TEMP', TEMP_COLOR_SCALE],
    ['RH', RH_COLOR_SCALE],
    ['NO2', NO2_COLOR_SCALE],
    ['O3', O3_COLOR_SCALE],
    ['CO', CO_COLOR_SCALE],
    ['SST', SST_COLOR_SCALE],
    ['SSTA', SSTA_COLOR_SCALE],
    ['WAVES', WAVES_COLOR_SCALE],
    ['CURRENTS', CURRENTS_COLOR_SCALE],
    ['POLLEN', POLLEN_COLOR_SCALE],
  ];

  it('returns every WHO/IQAir-style threshold color byte-exact — OKLab lerp only touches interiors', () => {
    // Arrange / Act / Assert
    for (const [, scale] of ALL_PRODUCTION_SCALES) {
      for (const [threshold, rgb] of scale) {
        expect(valueToRgb(threshold, scale)).toEqual(rgb);
      }
    }
  });

  it('increases mid-band chroma for the PM2.5 green→cyan band vs a plain sRGB lerp', () => {
    // Arrange — the 12→35 band is green(#10b981) → cyan(#25e2f4), the exact pair named
    // in the Phase 3 task. Compare the production valueToRgb() path (OKLab lerp) against
    // a manual per-channel sRGB lerp at the same interpolation fraction.
    const lo = PM25_COLOR_SCALE[1]; // [12, [16,185,129]]
    const hi = PM25_COLOR_SCALE[2]; // [35, [37,226,244]]
    const midValue = (lo[0] + hi[0]) / 2;
    const t = 0.5;
    const srgbLerp: [number, number, number] = [
      Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * t),
      Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * t),
      Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * t),
    ];
    // Act
    const oklabResult = valueToRgb(midValue, PM25_COLOR_SCALE);
    // Assert — chroma(rgb) = OKLab a/b magnitude, re-deriving both results through the
    // same conversion so they're compared on equal footing.
    const chroma = (rgb: readonly [number, number, number]): number => {
      const [, a, b] = srgbToOklab(rgb);
      return Math.sqrt(a * a + b * b);
    };
    expect(chroma(oklabResult)).toBeGreaterThan(chroma(srgbLerp));
  });
});
