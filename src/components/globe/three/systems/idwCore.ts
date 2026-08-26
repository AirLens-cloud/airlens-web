/**
 * idwCore — pure IDW (inverse-distance-weighting) heatmap field builder.
 *
 * Extracted from ScalarFieldOverlay.tsx (Globe P4a) so the same logic runs
 * on the main thread (sync fallback) and inside idw.worker.ts (offload).
 * No three/react/DOM imports — must be importable from a Worker context.
 */
import type { ColorSegments, IdwStationPt, IdwParams } from '../../../../types/globe';
import { srgbToOklab, oklabToSrgb } from '../../../../lib/earth/color';
import { wrapDeltaLon } from '../../../../lib/earth/geo';

const DEG2RAD = Math.PI / 180;

/**
 * Per-band OKLab-lerp look-up table, cached per scale. A naive per-pixel OKLab lerp
 * (converting each threshold to OKLab once, but still running `oklabToSrgb` — 2
 * `Math.pow` calls per channel for the linear→sRGB gamma — on every pixel) benchmarked
 * ~3.5x slower than the old sRGB channel lerp on a 1024×512 texture (~10ms → ~33ms).
 * Precomputing LUT_STEPS samples per band once per scale (not per pixel) restores
 * parity: the hot loop below is a single array lookup. 256 steps keeps quantization
 * error to ≤1 sRGB unit per channel vs. the exact (uncached) OKLab lerp.
 */
const LUT_STEPS = 256;

const scaleLutCache = new WeakMap<
  ColorSegments,
  ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>
>();

function getScaleLut(
  scale: ColorSegments,
): ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> {
  let bandLuts = scaleLutCache.get(scale);
  if (!bandLuts) {
    const oklabStops = scale.map(([, rgb]) => srgbToOklab(rgb));
    const built: Array<Array<readonly [number, number, number]>> = [];
    for (let i = 1; i < scale.length; i++) {
      const [L0, a0, b0] = oklabStops[i - 1];
      const [L1, a1, b1] = oklabStops[i];
      const samples: Array<readonly [number, number, number]> = new Array(LUT_STEPS + 1);
      // Band-boundary samples stay byte-exact — never OKLab-derived — so the WHO/IQAir
      // threshold colors never drift by even a rounding unit.
      samples[0] = scale[i - 1][1];
      samples[LUT_STEPS] = scale[i][1];
      for (let k = 1; k < LUT_STEPS; k++) {
        const t = k / LUT_STEPS;
        samples[k] = oklabToSrgb([L0 + (L1 - L0) * t, a0 + (a1 - a0) * t, b0 + (b1 - b0) * t]);
      }
      built.push(samples);
    }
    bandLuts = built;
    scaleLutCache.set(scale, bandLuts);
  }
  return bandLuts;
}

/**
 * Interpolate value to RGB via color scale. Threshold (breakpoint) colors are returned
 * exactly as authored; interpolation *between* thresholds runs in OKLab space (via a
 * precomputed per-band LUT) so a green→cyan transition doesn't dip through a muddy
 * sRGB-lerp grey.
 */
export function valueToRgb(value: number, scale: ColorSegments): [number, number, number] {
  if (value <= scale[0][0]) return scale[0][1] as [number, number, number];
  for (let i = 1; i < scale.length; i++) {
    if (value <= scale[i][0]) {
      const [lo] = scale[i - 1];
      const [hi] = scale[i];
      const t = (value - lo) / (hi - lo);
      const bandLut = getScaleLut(scale)[i - 1];
      const idx = Math.max(0, Math.min(LUT_STEPS, Math.round(t * LUT_STEPS)));
      return bandLut[idx] as [number, number, number];
    }
  }
  return scale[scale.length - 1][1] as [number, number, number];
}

/**
 * Observation-density confidence factor, in [minFactor, 1].
 *
 * `meanDistDeg` is the IDW-weighted mean distance from a cell to the observations
 * that produced its value — a proxy for how much real data the cell rests on. Cells
 * within `fullDeg` are treated as locally observed (factor 1); past `fadeDeg` the
 * factor saturates at `minFactor` so a sparse cell fades but never vanishes.
 *
 * Shape deliberately mirrors `predictionParse.bandRelWidthToAlpha` — same linear
 * ramp-to-floor, so the two confidence encodings on this page read alike.
 *
 * Why weighted mean distance and not the raw weight sum: `wSum = Σ dᵢ^-p` has no
 * upper bound (it diverges as a station is approached) and lets count offset
 * distance, so twenty observations 14° away would score like one observation 3°
 * away — an overclaim. The weighted mean is bounded by construction to
 * [0, maxDistDeg] and is dominated by the nearest contributor, which is the honest
 * reading. It does ignore count: one observation at 3° and a hundred at 3° score
 * the same. That is correct for spatial representativeness, which is what the
 * caveat copy claims — it does not claim sampling density.
 */
export function densityAlphaFactor(
  meanDistDeg: number,
  fullDeg: number,
  fadeDeg: number,
  minFactor: number,
): number {
  if (!Number.isFinite(meanDistDeg) || !(fadeDeg > fullDeg)) return 1;
  const t = Math.min(Math.max((meanDistDeg - fullDeg) / (fadeDeg - fullDeg), 0), 1);
  return 1 - t * (1 - minFactor);
}

/** Build equirectangular IDW RGBA pixels. Pure — same output on worker & main thread. */
export function buildIdwField(
  stations: IdwStationPt[],
  scale: ColorSegments,
  w: number,
  h: number,
  params: IdwParams,
): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(w * h * 4);
  const {
    power, maxDistDeg, alphaMax, alphaBase, alphaDivisor,
    densityFullDeg, densityFadeDeg, densityAlphaMin,
  } = params;
  const scaleMax = scale[scale.length - 1][0];

  // Clamp the density ramp against the support radius once, outside the pixel loop:
  // a caller with maxDistDeg below densityFullDeg would otherwise get a ramp that can
  // never be entered, and fadeDeg ≤ fullDeg would divide by zero.
  const fadeDeg = Math.min(densityFadeDeg, maxDistDeg);
  const fullDeg = Math.min(densityFullDeg, fadeDeg);

  // Station cos(lat) precomputed once — reused every pixel below (equirectangular
  // approximation, not full haversine: a pixel/station trig-heavy distance would
  // be too costly for a 512x1024 x N-station hot loop). dist stays in degrees so
  // maxDistDeg keeps its existing meaning; only dLon is cos-scaled.
  const stationCosLat = new Float64Array(stations.length);
  for (let i = 0; i < stations.length; i++) {
    stationCosLat[i] = Math.cos(stations[i].lat * DEG2RAD);
  }

  for (let y = 0; y < h; y++) {
    const lat = 90 - (y / h) * 180;
    const cosRow = Math.cos(lat * DEG2RAD);
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * 360 - 180;
      const idx = (y * w + x) * 4;

      let wSum = 0;
      let vSum = 0;
      let dSum = 0;

      for (let si = 0; si < stations.length; si++) {
        const s = stations[si];
        const dLat = lat - s.lat;
        const dLon = wrapDeltaLon(lon - s.lon) * (0.5 * (cosRow + stationCosLat[si]));
        const dist = Math.sqrt(dLat * dLat + dLon * dLon);
        if (dist > maxDistDeg) continue;
        if (dist < 0.01) {
          wSum = 1;
          vSum = s.value;
          // Reset the distance accumulator too: this cell *is* an observation, so its
          // weighted mean distance is 0 and it must never be faded. Leaving whatever
          // earlier stations contributed would poison every observation cell.
          dSum = 0;
          break;
        }
        const weight = 1 / Math.pow(dist, power);
        wSum += weight;
        vSum += weight * s.value;
        dSum += weight * dist;
      }

      if (wSum > 0) {
        const val = vSum / wSum;
        const [r, g, b] = valueToRgb(val, scale);
        // Alpha proportional to value magnitude relative to scale max
        const normalized = Math.abs(val) / scaleMax;
        // Clamp BEFORE applying the density factor. The two orders are not
        // equivalent: alphaBase + val/alphaDivisor already saturates around
        // 65 µg/m³, so multiplying first and clamping after would exempt every
        // cell above ~124 µg/m³ from the decay — precisely the hazardous cells
        // where an unearned confident look is most costly.
        const valueAlpha = Math.min(alphaMax, alphaBase + normalized / (alphaDivisor / scaleMax));
        // Weighted mean distance to the contributing observations — bounded by
        // construction to [0, maxDistDeg], unlike wSum which has no upper bound.
        const meanDist = dSum / wSum;
        const alpha = valueAlpha * densityAlphaFactor(meanDist, fullDeg, fadeDeg, densityAlphaMin);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = Math.round(alpha * 255);
      }
    }
  }

  return data;
}
