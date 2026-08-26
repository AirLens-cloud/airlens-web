/**
 * OKLab perceptual color space conversions (Björn Ottosson, public formulas —
 * https://bottosson.github.io/posts/oklab/). No external dependency, no DOM/browser
 * API — must stay importable from idw.worker.ts (Web Worker context).
 */

type Rgb = readonly [number, number, number];
type Lab = readonly [number, number, number];

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearChannelToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(v * 255)));
}

/** sRGB (0-255 ints) → OKLab (L ≈ [0,1], a/b small signed range). */
export function srgbToOklab([r, g, b]: Rgb): Lab {
  const lr = srgbChannelToLinear(r);
  const lg = srgbChannelToLinear(g);
  const lb = srgbChannelToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

/** OKLab → sRGB (0-255 ints, clamped/rounded). */
export function oklabToSrgb([L, a, b]: Lab): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [linearChannelToSrgb(lr), linearChannelToSrgb(lg), linearChannelToSrgb(lb)];
}

/** Interpolate two sRGB colors through OKLab space (perceptually uniform lerp). */
export function oklabLerp(rgbA: Rgb, rgbB: Rgb, t: number): [number, number, number] {
  const [L0, a0, b0] = srgbToOklab(rgbA);
  const [L1, a1, b1] = srgbToOklab(rgbB);
  return oklabToSrgb([L0 + (L1 - L0) * t, a0 + (a1 - a0) * t, b0 + (b1 - b0) * t]);
}

/**
 * Raise a color's OKLab lightness to at least `minL`, preserving hue/chroma.
 * Globe data layers render over a dark night-side earth; low-value colors below the
 * floor sink into the background ("검은색으로 보인다"). This lifts perceived brightness
 * without shifting hue, so a ramp's low end stays legible on both the lit and unlit
 * hemisphere. minL is an OKLab L value (~0..1); 0.45 is the globe data-layer floor.
 */
export function oklabLightnessFloor(rgb: Rgb, minL: number): [number, number, number] {
  const [L, a, b] = srgbToOklab(rgb);
  if (L >= minL) return [rgb[0], rgb[1], rgb[2]];
  return oklabToSrgb([minL, a, b]);
}
