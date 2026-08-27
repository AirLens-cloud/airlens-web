/**
 * windTexture — fetch wind data and encode into a DataTexture for GPU particles.
 *
 * Converts WindField (u/v bilinear grid) into a THREE.DataTexture
 * that can be sampled in a shader for particle advection.
 */
import * as THREE from 'three';
import { fetchWindField } from '../../../../api/weather';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';
import { logger } from '../../../../lib/logger';
import { track } from '../../../../lib/analytics';
import type { PressureLevel, WindFieldMeta } from '../../../../types/globe';

const { WIND_TEXTURE } = GLOBE_CONFIG.GLOBE_V2;

interface LevelCache {
  texture: THREE.DataTexture;
  expiry: number;
  meta?: WindFieldMeta;
}

// Cached per level. A single module-wide cache would hand back the surface
// texture after a switch to 850hPa — the altitude toggle would appear to work
// while showing the wrong air.
const cache = new Map<PressureLevel, LevelCache>();
const failedUntil = new Map<PressureLevel, number>(); // negative cache — no retry spam

const FAILURE_COOLDOWN_MS = 5 * 60 * 1000; // 5 min before retrying after failure

/**
 * Clamp a wind component (m/s) into the encodable scale range. Exported for
 * the encode-bounds test — the texture is the only contract the advection
 * paths (CPU `advectStep` / GPU compute shader) decode from.
 */
export function clampToScale(component: number): number {
  return Math.max(WIND_TEXTURE.SCALE_MIN, Math.min(WIND_TEXTURE.SCALE_MAX, component));
}

/** Provenance of the cached texture for a level (null if none is cached). */
export function getWindMeta(level: PressureLevel): WindFieldMeta | null {
  return cache.get(level)?.meta ?? null;
}

/** Fetch wind field and encode as RGBA DataTexture (u→R, v→G, speed→B). */
export async function getWindDataTexture(
  level: PressureLevel = 'surface',
): Promise<THREE.DataTexture | null> {
  const hit = cache.get(level);
  if (hit && Date.now() < hit.expiry) {
    return hit.texture;
  }

  // Don't retry if we recently failed
  if (Date.now() < (failedUntil.get(level) ?? 0)) {
    return null;
  }

  try {
    const field = await fetchWindField(level);
    if (!field) {
      // No data at this level — render nothing. Never substitute another level.
      logger.warn('windTexture: no wind field available', level);
      track('globe_wind_level_unavailable', { level });
      failedUntil.set(level, Date.now() + FAILURE_COOLDOWN_MS);
      return null;
    }

    const w = WIND_TEXTURE.WIDTH;
    const h = WIND_TEXTURE.HEIGHT;
    const data = new Float32Array(w * h * 4);

    for (let y = 0; y < h; y++) {
      const lat = 90 - (y / h) * 180;
      for (let x = 0; x < w; x++) {
        const lon = (x / w) * 360 - 180;
        const idx = (y * w + x) * 4;

        const raw = field.interpolate(lat, lon);
        // Clamp to the encodable range BEFORE normalizing. Jet-stream cells can
        // exceed ±100 m/s; unclamped they normalize past [0,1] and — because the
        // texture is FloatType — survive the round trip as an out-of-scale u/v
        // that advection turns into a visible particle jump. Clamping here (the
        // single encode site) bounds every decode: LinearFilter interpolation of
        // bounded texels stays bounded, so neither the CPU nor the GPU decode
        // path needs its own clamp.
        const u = clampToScale(raw.u);
        const v = clampToScale(raw.v);
        // Normalize to [0,1] range for texture storage
        const range = WIND_TEXTURE.SCALE_MAX - WIND_TEXTURE.SCALE_MIN;
        data[idx] = (u - WIND_TEXTURE.SCALE_MIN) / range;
        data[idx + 1] = (v - WIND_TEXTURE.SCALE_MIN) / range;
        data[idx + 2] = Math.sqrt(u * u + v * v) / WIND_TEXTURE.SCALE_MAX; // speed
        data[idx + 3] = 1.0;
      }
    }

    hit?.texture.dispose();
    const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    cache.set(level, {
      texture,
      expiry: Date.now() + WIND_TEXTURE.CACHE_TTL_MS,
      meta: field.meta,
    });
    return texture;
  } catch (err) {
    // Was fully silent — wind simply never rendered. Log + emit so float-texture
    // failures are visible in the field (behaviour unchanged: still cools down).
    logger.warn('windTexture: build failed, wind particles disabled', level, err);
    track('globe_wind_texture_error', {
      level,
      message: err instanceof Error ? err.message : String(err),
    });
    failedUntil.set(level, Date.now() + FAILURE_COOLDOWN_MS);
    return null;
  }
}
