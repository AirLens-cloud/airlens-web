/**
 * pollutionTexture — bakes PollutionSource[] into a low-res equirectangular
 * DataTexture so the P3 GPU trail vertex shader can sample "pollution at
 * (lat, lon)" with one texture2D lookup instead of the CPU path's per-frame
 * O(particle count) spatial-grid query.
 *
 * Pure function — constructing a THREE.DataTexture does not touch WebGL
 * (no GPU upload happens until a renderer consumes it), so this is safe to
 * call and unit-test in a headless/CI environment.
 */
import * as THREE from 'three';
import { buildSpatialGrid, queryGrid } from './pollutionGrid';
import type { PollutionSource } from '../../../../types/globe';

/**
 * Bake pollution intensity (0-1) into an RGBA float DataTexture, R channel
 * only (G/B/A left at 0/0/1) — matches windTexture.ts's RGBA/FloatType
 * convention so both textures share the same sampler setup in the vertex
 * shader.
 */
export function buildPollutionTexture(
  sources: PollutionSource[],
  width: number,
  height: number,
): THREE.DataTexture {
  const grid = buildSpatialGrid(sources);
  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const lat = 90 - (y / height) * 180;
    for (let x = 0; x < width; x++) {
      const lon = (x / width) * 360 - 180;
      const idx = (y * width + x) * 4;
      data[idx] = queryGrid(grid, lat, lon);
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 1;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
