/**
 * scalarField — convert AQ grid data into a color-mapped DataTexture for GPU overlay.
 *
 * Similar to windTexture.ts but for scalar fields (PM2.5, PM10, O3, NO2, etc.).
 * Uses color scales from config.ts to map values → RGBA.
 */
import * as THREE from 'three';
import { fetchAQGrid, fetchTimelineFrame, isAQOverlay } from '../../../../api/airQualityGrid';
import { OVERLAY_SCALE_MAP } from '../../../../lib/config/globeOverlays';
import { valueToRgb } from './idwCore';
import type { ColorSegments } from '../../../../types/globe';
import type { OverlayType, OverlayGridData } from '../../../../types/globe';

// ── Texture cache ───────────────────────────────────────────────────────────

interface TextureCacheEntry {
  texture: THREE.DataTexture;
  expiresAt: number;
}

const textureCache = new Map<string, TextureCacheEntry>();
const TEXTURE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

// ── Active grid meta (provenance + value range, for Globe dashboard) ──────────

export interface ScalarFieldMeta {
  source?: string;
  /** null when the source grid carries no timestamp (R-W2 — honest "unknown"). */
  timestamp: number | null;
  min: number;
  max: number;
  /** Forecast lead hours of the rendered frame (P8b timeline; 0/undefined = analysis/live). */
  leadHours?: number;
  /** validTime (ms) of the rendered timeline frame (P8b). */
  validTime?: number;
}

/** Reference to a pre-collected timeline frame for texture fetch (P8b slider). */
export interface TimelineFrameRef {
  file: string;
  validTimeMs: number;
  leadHours: number;
}

const metaCache = new Map<OverlayType, ScalarFieldMeta>();

/** Last-fetched provenance + value range for an overlay (null if not loaded). */
export function getScalarFieldMeta(overlayType: OverlayType): ScalarFieldMeta | null {
  return metaCache.get(overlayType) ?? null;
}

// ── Grid value cache (hover readout) ────────────────────────────────────────
const gridCache = new Map<OverlayType, OverlayGridData>();

/** Normalize longitude to [-180, 180). */
function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Pure nearest-cell sampler. Returns null when out of range or missing (NaN). */
export function sampleGrid(grid: OverlayGridData, lat: number, lon: number): number | null {
  const latIdx = Math.round((lat - grid.latMin) / grid.dLat);
  const lonIdx = Math.round((normalizeLon(lon) - grid.lonMin) / grid.dLon);
  if (latIdx < 0 || latIdx >= grid.nLat || lonIdx < 0 || lonIdx >= grid.nLon) return null;
  const v = grid.values[latIdx * grid.nLon + lonIdx];
  return Number.isFinite(v) ? v : null;
}

/** Sample the last-fetched grid for an overlay (null if not loaded). */
export function sampleGridAt(overlayType: OverlayType, lat: number, lon: number): number | null {
  const grid = gridCache.get(overlayType);
  if (!grid) return null;
  return sampleGrid(grid, lat, lon);
}

// ── Texture dimensions (equirectangular mapping) ────────────────────────────

const TEX_WIDTH = 360;
const TEX_HEIGHT = 180;

// ── Public API ───��───────────────────────────��──────────────────────────────

/**
 * Fetch AQ data and encode as a color-mapped RGBA DataTexture.
 * Returns null if no data is available for the given overlay.
 */
export async function getScalarFieldTexture(
  overlayType: OverlayType,
  frame?: TimelineFrameRef,
): Promise<THREE.DataTexture | null> {
  // Timeline frames key by file so distinct offsets don't collide with the live grid.
  const cacheKey = frame ? `${overlayType}_${frame.file}` : overlayType;
  const cached = textureCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.texture;
  }

  // Only AQ overlays are supported (wind uses windTexture.ts)
  if (!isAQOverlay(overlayType)) return null;

  const colorScale = OVERLAY_SCALE_MAP[overlayType];
  if (!colorScale) return null;

  try {
    const grid = frame
      ? await fetchTimelineFrame(frame.file)
      : await fetchAQGrid(overlayType);
    if (!grid) return null;

    // Stash provenance + value range for the Globe dashboard (ActiveLayerCard).
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < grid.values.length; i++) {
      const v = grid.values[i];
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    metaCache.set(overlayType, {
      source: grid.source,
      timestamp: grid.timestamp,
      min: Number.isFinite(min) ? min : NaN,
      max: Number.isFinite(max) ? max : NaN,
      leadHours: frame?.leadHours,
      validTime: frame?.validTimeMs,
    });
    gridCache.set(overlayType, grid);

    const texture = gridToTexture(grid, colorScale);

    // Dispose old cached texture
    const old = textureCache.get(cacheKey);
    if (old) old.texture.dispose();

    textureCache.set(cacheKey, { texture, expiresAt: Date.now() + TEXTURE_CACHE_TTL_MS });
    return texture;
  } catch {
    return null;
  }
}

/**
 * Convert OverlayGridData → color-mapped RGBA DataTexture.
 * Uses bilinear-style nearest-neighbor fill for sparse grids.
 */
function gridToTexture(
  grid: OverlayGridData,
  colorScale: ColorSegments,
): THREE.DataTexture {
  const data = new Uint8Array(TEX_WIDTH * TEX_HEIGHT * 4);

  for (let y = 0; y < TEX_HEIGHT; y++) {
    const lat = 90 - y; // top = 90°N, bottom = 90°S
    for (let x = 0; x < TEX_WIDTH; x++) {
      const lon = x - 180; // left = 180°W, right = 180°E
      const idx = (y * TEX_WIDTH + x) * 4;

      // Find nearest grid cell
      const latIdx = Math.round((lat - grid.latMin) / grid.dLat);
      const lonIdx = Math.round((lon - grid.lonMin) / grid.dLon);

      if (latIdx >= 0 && latIdx < grid.nLat && lonIdx >= 0 && lonIdx < grid.nLon) {
        const value = grid.values[latIdx * grid.nLon + lonIdx];
        if (!isNaN(value) && isFinite(value)) {
          const [r, g, b] = valueToRgb(value, colorScale);
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 214; // overlay alpha — lifted from 180 for night-side legibility
          continue;
        }
      }

      // No data — transparent
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 0;
    }
  }

  const texture = new THREE.DataTexture(data, TEX_WIDTH, TEX_HEIGHT, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

/**
 * Dispose all cached scalar field textures (call on unmount).
 */
export function disposeScalarFieldTextures(): void {
  for (const entry of textureCache.values()) {
    entry.texture.dispose();
  }
  textureCache.clear();
  metaCache.clear();
  gridCache.clear();
}
