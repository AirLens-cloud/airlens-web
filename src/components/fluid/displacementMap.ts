/**
 * displacementMap.ts — SDF-based refraction map for the 'refract' LiquidGlass
 * tier. Encodes an outward-to-inward displacement vector into an RGBA image
 * (R/G = X/Y displacement, neutral = 128) that feeds an SVG
 * `<feDisplacementMap>` to bend the backdrop near a rounded-rect edge, the
 * way a real glass bezel refracts light.
 */

/**
 * Edge falloff curve. `dist` is a signed distance from a rounded-rect SDF
 * (negative = inside the shape). Ramps 0 -> 1 as `dist` goes from -bezel
 * (bezel depth, no displacement) to 0 (the edge, full displacement), squared
 * for a soft-then-sharp falloff. Zero everywhere else (flat interior, and
 * outside the shape).
 */
export function edgeProfile(dist: number, bezel: number): number {
  if (dist < -bezel || dist >= 0) return 0
  const t = 1 + dist / bezel
  return t * t
}

/** Signed distance to a rounded rect of size w x h (centered), corner radius r. */
function roundedBoxSdf(x: number, y: number, w: number, h: number, r: number): number {
  const qx = Math.abs(x - w / 2) - (w / 2 - r)
  const qy = Math.abs(y - h / 2) - (h / 2 - r)
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}

const CACHE_LIMIT = 16
const mapCache = new Map<string, string>()

/**
 * Builds (and caches) a data: URL displacement map for a `w x h` rounded
 * rect with corner radius `radius` and bezel depth `bezel`. Rendered at 2x
 * resolution for a smooth falloff at normal pixel density. Returns '' when
 * there is no usable 2D canvas (SSR, or a jsdom test environment without the
 * `canvas` package installed).
 */
export function buildDisplacementMap(w: number, h: number, radius: number, bezel: number): string {
  const key = `${w}x${h}:${radius}:${bezel}`
  const cached = mapCache.get(key)
  if (cached !== undefined) return cached

  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  const cw = w * 2
  const ch = h * 2
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const image = ctx.createImageData(cw, ch)
  const data = image.data

  for (let py = 0; py < ch; py++) {
    for (let px = 0; px < cw; px++) {
      const x = px / 2
      const y = py / 2
      const dist = roundedBoxSdf(x, y, w, h, radius)
      const idx = (py * cw + px) * 4
      const profile = edgeProfile(dist, bezel)

      if (profile === 0) {
        data[idx] = 128
        data[idx + 1] = 128
        data[idx + 2] = 128
        data[idx + 3] = 255
        continue
      }

      // Numeric gradient (+-1px) of the SDF -> outward unit normal.
      const gx = roundedBoxSdf(x + 1, y, w, h, radius) - roundedBoxSdf(x - 1, y, w, h, radius)
      const gy = roundedBoxSdf(x, y + 1, w, h, radius) - roundedBoxSdf(x, y - 1, w, h, radius)
      const len = Math.hypot(gx, gy) || 1
      const nx = gx / len
      const ny = gy / len

      // Inward displacement vector, scaled by the edge profile.
      const dx = -nx * profile
      const dy = -ny * profile

      data[idx] = Math.round(128 + dx * 127)
      data[idx + 1] = Math.round(128 + dy * 127)
      data[idx + 2] = 128
      data[idx + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  const dataUrl = canvas.toDataURL()

  mapCache.set(key, dataUrl)
  if (mapCache.size > CACHE_LIMIT) {
    const oldestKey = mapCache.keys().next().value
    if (oldestKey !== undefined) mapCache.delete(oldestKey)
  }

  return dataUrl
}
