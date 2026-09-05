/**
 * spriteKit — loads the AirLens Globe sprite kit (public/sprites, public/lut)
 * as THREE textures. Drop-in for the procedural canvas textures in
 * stationIconAtlas.ts / PredictionMarkers.tsx / FireHotspots.tsx /
 * PollenParticles.tsx: every sprite is white-on-alpha, so the existing
 * `vertexColors` / instanceColor tinting keeps working unchanged.
 *
 * Same-origin URLs only — matches the CSP note in CountryLabels.tsx.
 */
import * as THREE from 'three'

const loader = new THREE.TextureLoader()
const cache = new Map<string, THREE.Texture>()

export type SpriteName =
  | 'station-ground' | 'station-satellite'
  | 'prediction-band-narrow' | 'prediction-band-mid' | 'prediction-band-wide'
  | 'alert-pulse' | 'reticle' | 'pollen' | 'pollen-soft' | 'fire-flame'
  | 'glow-soft' | 'ember' | 'smoke-puff' | 'wind-particle' | 'star'

export type LutName = 'aqi-k4' | 'aqi-k4-field' | 'wind-speed' | 'temperature' | 'atmosphere-rim'

function load(url: string, opts: { srgb?: boolean; nearest?: boolean } = {}): THREE.Texture {
  const hit = cache.get(url)
  if (hit) return hit
  const tex = loader.load(url)
  if (opts.srgb) tex.colorSpace = THREE.SRGBColorSpace
  if (opts.nearest) { tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter }
  tex.generateMipmaps = !opts.nearest
  tex.anisotropy = 4
  cache.set(url, tex)
  return tex
}

/** White-on-alpha marker/particle sprite — tint with instanceColor / material.color. */
export function getSprite(name: SpriteName): THREE.Texture {
  return load(`/sprites/${name}.png`)
}

/** 256×1 colour LUT — sample in GLSL as texture2D(uLut, vec2(t, 0.5)). */
export function getLut(name: LutName): THREE.Texture {
  // ClampToEdge so t=0/1 never bleeds; linear filter gives smooth ramps.
  const tex = load(`/lut/${name}.png`, { srgb: true })
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

/**
 * p10–p90 band width → sprite tier. Keeps PredictionMarkers' existing
 * `bandRelWidthToAlpha` channel and adds a *shape* channel on top, so the
 * uncertainty reads even for colour-blind viewers (Glass-box §5).
 *   relWidth = (p90 - p10) / max(p50, 1)
 */
export function bandSprite(p10: number, p50: number, p90: number): SpriteName {
  const rel = (p90 - p10) / Math.max(p50, 1)
  if (rel < 0.35) return 'prediction-band-narrow'
  if (rel < 0.8) return 'prediction-band-mid'
  return 'prediction-band-wide'
}

/** Dispose everything (page unmount / HMR). */
export function disposeSpriteKit(): void {
  for (const t of cache.values()) t.dispose()
  cache.clear()
}
