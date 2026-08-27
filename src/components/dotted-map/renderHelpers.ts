/**
 * renderHelpers.ts — Pure rendering functions extracted from DottedMap render loop.
 *
 * Each function takes explicit parameters (ctx, projection, data) and has no side effects
 * beyond drawing to the Canvas 2D context. No React refs or state accessed directly.
 */

import { groupIndexToColor, DEFAULT_DOT_COLOR, COLOR_GROUP_COUNT, EXTRUDE_CONFIG, ALPHA_BUCKETS, alphaBucketToFactor } from './idw';
import type { MarkerData } from './types';

const TWO_PI = Math.PI * 2;

// ── Types ──

export type { PrecomputedDot, ProjectionParams, GlobeColors } from '../../types/dotted-map'
import type { PrecomputedDot, ProjectionParams, GlobeColors } from '../../types/dotted-map'

// ── Globe background ──

export function renderGlobeBackground(
  ctx: CanvasRenderingContext2D,
  proj: ProjectionParams,
  colors: GlobeColors,
): void {
  if (proj.tVal <= 0.01) return;
  ctx.globalAlpha = proj.tVal;
  ctx.beginPath();
  ctx.arc(proj.globeCx, proj.globeCy, proj.radius, 0, TWO_PI);
  ctx.fillStyle = colors.globeFill;
  ctx.fill();
  ctx.strokeStyle = colors.outlineColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── Extrude height animation (in-place mutation of Float32Arrays) ──

export function animateExtrudeHeights(
  heights: Float32Array | null,
  targets: Float32Array | null,
): Float32Array | null {
  if (targets && heights) {
    for (let i = 0; i < heights.length; i++) {
      heights[i] += (targets[i] - heights[i]) * EXTRUDE_CONFIG.ANIM_SPEED;
    }
    return heights;
  }
  if (heights && !targets) {
    let anyNonZero = false;
    for (let i = 0; i < heights.length; i++) {
      if (heights[i] > 0.001) {
        heights[i] *= (1 - EXTRUDE_CONFIG.ANIM_SPEED);
        anyNonZero = true;
      } else {
        heights[i] = 0;
      }
    }
    return anyNonZero ? heights : null;
  }
  return heights;
}

// ── Dot projection helper (shared by dots + clusters) ──

function projectDot(
  p: PrecomputedDot,
  proj: ProjectionParams,
  extrudeHeight: number,
  dotRadius: number,
): { x: number; y: number; dr: number; visible: boolean } {
  const h = extrudeHeight;
  const r = h > 0.001 ? proj.radius * (1 + h) : proj.radius;
  const dr = h > 0.001 ? dotRadius * (1 + h * EXTRUDE_CONFIG.DOT_SCALE) : dotRadius;
  const fx = proj.flatCx + proj.flatFactor * p.lng;
  let fy = proj.flatCy - proj.flatFactor * p.lat;

  if (proj.tVal < 0.01) {
    if (h > 0.001) fy -= h * EXTRUDE_CONFIG.FLAT_LIFT_PX;
    const visible = fx >= -10 && fx <= proj.width + 10 && fy >= -10 && fy <= proj.height + 10;
    return { x: fx, y: fy, dr, visible };
  }

  const λRel = p.λ - proj.λ0;
  const cosλRel = Math.cos(λRel);
  const cosc = proj.sinφ0 * p.sinφ + proj.cosφ0 * p.cosφ * cosλRel;
  if (cosc < 0 && h < 0.001) return { x: 0, y: 0, dr, visible: false };
  if (cosc < -0.2) return { x: 0, y: 0, dr, visible: false };

  const sinλRel = Math.sin(λRel);
  const gx = proj.globeCx + r * p.cosφ * sinλRel;
  const gy = proj.globeCy - r * (proj.cosφ0 * p.sinφ - proj.sinφ0 * p.cosφ * cosλRel);

  if (proj.tVal > 0.99) {
    return { x: gx, y: gy, dr, visible: true };
  }
  return { x: fx + (gx - fx) * proj.tVal, y: fy + (gy - fy) * proj.tVal, dr, visible: true };
}

// ── IDW color-grouped dot rendering ──

export function renderLandDotsIDW(
  ctx: CanvasRenderingContext2D,
  precomputed: PrecomputedDot[],
  proj: ProjectionParams,
  dotRadius: number,
  colorGroups: Uint8Array,
  alphaGroups: Uint8Array,
  heights: Float32Array | null,
  isDark: boolean,
): void {
  // Bin by (color, density-alpha bucket) pair — V-W4 delta 3: a dot resting on
  // sparse observation renders more faded, honestly, without falling back to
  // one-draw-call-per-dot (the batched fill below stays O(COLOR_GROUP_COUNT ×
  // ALPHA_BUCKETS) canvas state changes, not O(land points)).
  const bins: number[][][] = [];
  for (let g = 0; g < COLOR_GROUP_COUNT; g++) {
    const perAlpha: number[][] = [];
    for (let a = 0; a < ALPHA_BUCKETS; a++) perAlpha.push([]);
    bins.push(perAlpha);
  }
  const defaultBin: number[] = [];

  for (let i = 0, len = precomputed.length; i < len; i++) {
    const group = colorGroups[i];
    if (group === 255) defaultBin.push(i);
    else bins[group][alphaGroups[i]].push(i);
  }

  const extrudedDots: { x: number; y: number; dr: number; origY: number }[] = [];

  const drawBin = (indices: number[], fillStyle: string, alpha: number) => {
    if (indices.length === 0) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    for (const i of indices) {
      const h = heights ? heights[i] : 0;
      const { x, y, dr, visible } = projectDot(precomputed[i], proj, h, dotRadius);
      if (!visible) continue;
      ctx.moveTo(x + dr, y);
      ctx.arc(x, y, dr, 0, TWO_PI);
      if (h > 0.01 && proj.tVal < 0.5) {
        const origY = y + h * EXTRUDE_CONFIG.FLAT_LIFT_PX * (1 - proj.tVal);
        extrudedDots.push({ x, y, dr, origY });
      }
    }
    ctx.fill();
  };

  for (let g = 0; g < COLOR_GROUP_COUNT; g++) {
    const color = groupIndexToColor(g, isDark);
    for (let a = 0; a < ALPHA_BUCKETS; a++) {
      drawBin(bins[g][a], color, alphaBucketToFactor(a));
    }
  }
  drawBin(defaultBin, DEFAULT_DOT_COLOR, 1);
  ctx.globalAlpha = 1;

  if (extrudedDots.length > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    for (const d of extrudedDots) {
      ctx.moveTo(d.x + d.dr * 0.8, d.origY);
      ctx.ellipse(d.x, d.origY, d.dr * 0.8, d.dr * 0.4, 0, 0, TWO_PI);
    }
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = EXTRUDE_CONFIG.EXTRUDE_COLOR;
    ctx.beginPath();
    const glowR = 2.2;
    for (const d of extrudedDots) {
      const gr = d.dr * glowR;
      ctx.moveTo(d.x + gr, d.y);
      ctx.arc(d.x, d.y, gr, 0, TWO_PI);
    }
    ctx.fill();
    ctx.restore();
  }
}

// ── Default single-color dot rendering ──

export function renderLandDotsDefault(
  ctx: CanvasRenderingContext2D,
  precomputed: PrecomputedDot[],
  proj: ProjectionParams,
  dotRadius: number,
  dotColor: string,
  heights: Float32Array | null,
): void {
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  for (let i = 0, len = precomputed.length; i < len; i++) {
    const h = heights ? heights[i] : 0;
    const { x, y, dr, visible } = projectDot(precomputed[i], proj, h, dotRadius);
    if (!visible) continue;
    ctx.moveTo(x + dr, y);
    ctx.arc(x, y, dr, 0, TWO_PI);
  }
  ctx.fill();
}

// ── Cluster types + screen-space merge ──

export interface ProjectedCluster {
  px: number;
  py: number;
  markers: MarkerData[];
  hasActive: boolean;
  activeCount: number;
  sourceIndices: number[];
}

const MERGE_MIN_DIST = 50;
const MERGE_MIN_DIST_SQ = MERGE_MIN_DIST * MERGE_MIN_DIST;

/**
 * Merge overlapping projected clusters using weighted centroid.
 * Pure function — no DOM or ref access.
 */
export function mergeClusters(projected: ProjectedCluster[]): ProjectedCluster[] {
  const merged: ProjectedCluster[] = [];
  const used = new Uint8Array(projected.length);

  for (let i = 0; i < projected.length; i++) {
    if (used[i]) continue;
    const m: ProjectedCluster = {
      ...projected[i],
      markers: [...projected[i].markers],
      sourceIndices: [...projected[i].sourceIndices],
    };
    let totalX = m.px * m.markers.length;
    let totalY = m.py * m.markers.length;
    let totalCount = m.markers.length;

    for (let j = i + 1; j < projected.length; j++) {
      if (used[j]) continue;
      const dx = m.px - projected[j].px;
      const dy = m.py - projected[j].py;
      if (dx * dx + dy * dy < MERGE_MIN_DIST_SQ) {
        used[j] = 1;
        const jCount = projected[j].markers.length;
        totalX += projected[j].px * jCount;
        totalY += projected[j].py * jCount;
        totalCount += jCount;
        m.markers.push(...projected[j].markers);
        m.sourceIndices.push(...projected[j].sourceIndices);
        if (projected[j].hasActive) m.hasActive = true;
        m.activeCount += projected[j].activeCount;
        m.px = totalX / totalCount;
        m.py = totalY / totalCount;
      }
    }
    merged.push(m);
  }
  return merged;
}
