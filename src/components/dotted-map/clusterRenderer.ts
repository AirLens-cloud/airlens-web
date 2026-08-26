/**
 * clusterRenderer.ts — Pure functions for cluster projection, animation, and rendering.
 *
 * Extracted from DottedMap render loop. Each function takes explicit parameters
 * and has no side effects beyond drawing to the Canvas 2D context.
 * No React refs, state, or DOM access.
 */

import { mergeClusters, type ProjectionParams, type ProjectedCluster } from './renderHelpers';
import type { AnimCluster, ClusterDatum, HitTarget } from './types';

const TWO_PI = Math.PI * 2;

// Re-export ClusterDatum for downstream consumers
export type { ClusterDatum } from './types';

/** Colors required by the cluster renderer. */
export interface ClusterColors {
  clusterBg: string;
  clusterBorder: string;
  clusterText: string;
  activeGlow: string;
  activeBadge: string;
}

/** Result of rendering animated clusters — hit targets + solo marker positions. */
export interface ClusterRenderResult {
  hitTargets: HitTarget[];
  soloPositions: Map<number, { x: number; y: number; alpha: number; scale: number }>;
  activeGlows: Array<{ x: number; y: number; alpha: number; radius: number }>;
}

// ── Function 1: projectClustersToScreen ──

/**
 * Project geo-clusters to screen coordinates using flat↔globe interpolation.
 *
 * @param clusterData - Pre-computed cluster data with trig values
 * @param proj - Current projection parameters (tVal, rotation, scale)
 * @param width - Canvas CSS width
 * @param height - Canvas CSS height
 * @returns Array of projected clusters with screen positions
 */
export function projectClustersToScreen(
  clusterData: readonly ClusterDatum[],
  proj: ProjectionParams,
): ProjectedCluster[] {
  const projected: ProjectedCluster[] = [];

  for (let ci = 0; ci < clusterData.length; ci++) {
    const cd = clusterData[ci];
    const gc = cd.cluster;

    const fx = proj.flatCx + proj.flatFactor * cd.lng;
    const fy = proj.flatCy - proj.flatFactor * cd.lat;
    let px = fx;
    let py = fy;
    let visible = true;

    if (proj.tVal > 0.01) {
      const λRel = cd.λ - proj.λ0;
      const cosλRel = Math.cos(λRel);
      const cosc = proj.sinφ0 * cd.sinφ + proj.cosφ0 * cd.cosφ * cosλRel;
      if (cosc < 0) {
        visible = false;
      } else {
        const sinλRel = Math.sin(λRel);
        const gx = proj.globeCx + proj.radius * cd.cosφ * sinλRel;
        const gy =
          proj.globeCy -
          proj.radius * (proj.cosφ0 * cd.sinφ - proj.sinφ0 * cd.cosφ * cosλRel);
        px = fx + (gx - fx) * proj.tVal;
        py = fy + (gy - fy) * proj.tVal;
      }
    }

    if (
      !visible ||
      px < -30 ||
      px > proj.width + 30 ||
      py < -30 ||
      py > proj.height + 30
    ) {
      continue;
    }

    projected.push({
      px,
      py,
      markers: gc.markers,
      hasActive: gc.hasActive,
      activeCount: gc.activeCount,
      sourceIndices: [ci],
    });
  }

  return projected;
}

// ── Function 2: animateClusters ──

/**
 * Animate cluster transitions by matching and interpolating with previous frame.
 *
 * Matches current merged clusters to previous AnimClusters by proximity,
 * interpolates position/size/opacity, and fades out dying clusters.
 *
 * @param merged - Current frame's merged projected clusters
 * @param prev - Previous frame's animated clusters
 * @param lerpSpeed - Interpolation speed (higher = snappier, e.g. 0.15 normal, 0.5 dragging)
 * @returns New AnimCluster array for this frame
 */
export function animateClusters(
  merged: readonly ProjectedCluster[],
  prev: readonly AnimCluster[],
  lerpSpeed: number,
): AnimCluster[] {
  const next: AnimCluster[] = [];
  const matchedPrev = new Uint8Array(prev.length);

  for (const m of merged) {
    const count = m.markers.length;
    const isSolo = count === 1;
    const targetSize = isSolo ? 16 : Math.min(14 + count * 0.4, 28);

    let bestIdx = -1;
    let bestDistSq = 80 * 80;
    for (let pi = 0; pi < prev.length; pi++) {
      if (matchedPrev[pi]) continue;
      const dx = prev[pi].tx - m.px;
      const dy = prev[pi].ty - m.py;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = pi;
      }
    }

    if (bestIdx >= 0) {
      matchedPrev[bestIdx] = 1;
      const p = prev[bestIdx];
      next.push({
        x: p.x + (m.px - p.x) * lerpSpeed,
        y: p.y + (m.py - p.y) * lerpSpeed,
        tx: m.px,
        ty: m.py,
        size: p.size + (targetSize - p.size) * lerpSpeed,
        tSize: targetSize,
        count: p.count + (count - p.count) * lerpSpeed,
        tCount: count,
        alpha: p.alpha + (1 - p.alpha) * lerpSpeed,
        tAlpha: 1,
        markers: m.markers,
        hasActive: m.hasActive,
        activeCount: m.activeCount,
        sourceIndices: m.sourceIndices,
        isSolo,
      });
    } else {
      next.push({
        x: m.px,
        y: m.py,
        tx: m.px,
        ty: m.py,
        size: targetSize * 0.3,
        tSize: targetSize,
        count,
        tCount: count,
        alpha: 0.2,
        tAlpha: 1,
        markers: m.markers,
        hasActive: m.hasActive,
        activeCount: m.activeCount,
        sourceIndices: m.sourceIndices,
        isSolo,
      });
    }
  }

  // Fade out dying clusters
  for (let pi = 0; pi < prev.length; pi++) {
    if (matchedPrev[pi]) continue;
    const p = prev[pi];
    const newAlpha = p.alpha * 0.8;
    if (newAlpha < 0.05) continue;
    next.push({
      ...p,
      alpha: newAlpha,
      tAlpha: 0,
      size: p.size * 0.9,
    });
  }

  return next;
}

// ── Function 3: renderAnimatedClusters ──

/**
 * Render animated clusters to a Canvas 2D context.
 *
 * Draws cluster circles, count text, active pulse/badge for multi-marker clusters.
 * For solo markers (when renderMarker is true), returns positioning data instead
 * of drawing, so the caller can position DOM elements.
 *
 * @param ctx - Canvas 2D rendering context
 * @param clusters - Current frame's animated clusters
 * @param colors - Theme colors for cluster rendering
 * @param now - Current timestamp (Date.now()) for pulse animation
 * @param hasDOMMarkers - Whether solo markers are rendered as DOM elements
 * @returns Hit targets for click detection + solo marker positioning data
 */
export function renderAnimatedClusters(
  ctx: CanvasRenderingContext2D,
  clusters: readonly AnimCluster[],
  colors: ClusterColors,
  now: number,
  hasDOMMarkers: boolean,
): ClusterRenderResult {
  const hitTargets: HitTarget[] = [];
  const soloPositions = new Map<number, { x: number; y: number; alpha: number; scale: number }>();
  const activeGlows: ClusterRenderResult['activeGlows'] = [];

  for (const ac of clusters) {
    if (ac.tAlpha === 0 && ac.alpha < 0.05) continue;
    const { x: px, y: py } = ac;

    // Guard non-finite coordinates
    if (!isFinite(px) || !isFinite(py)) continue;

    if (!ac.isSolo || ac.tAlpha === 0 || !hasDOMMarkers) {
      const size = ac.size;

      // Guard non-finite size
      if (!isFinite(size) || size <= 0) continue;

      ctx.globalAlpha = ac.alpha;

      if (ac.hasActive && ac.tAlpha > 0) {
        const pulseScale = 1 + 0.15 * Math.sin((now / 600) * Math.PI);
        const pulseRadius = size * 1.2 * pulseScale;
        if (isFinite(pulseRadius) && pulseRadius > 0) {
          ctx.beginPath();
          ctx.arc(px, py, pulseRadius, 0, TWO_PI);
          ctx.fillStyle = colors.activeGlow;
          ctx.fill();
        }
      }

      ctx.beginPath();
      ctx.arc(px, py, size, 0, TWO_PI);
      ctx.fillStyle = colors.clusterBg;
      ctx.fill();
      ctx.strokeStyle = colors.clusterBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = colors.clusterText;
      ctx.font = `bold ${Math.min(12, size * 0.7)}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const displayCount = Math.round(ac.count);
      if (displayCount > 0) {
        ctx.fillText(String(displayCount), px, py + 0.5);
      }

      if (ac.activeCount > 0 && ac.tAlpha > 0) {
        const badgeX = px + size * 0.7;
        const badgeY = py - size * 0.7;
        if (isFinite(badgeX) && isFinite(badgeY)) {
          ctx.beginPath();
          ctx.arc(badgeX, badgeY, 7, 0, TWO_PI);
          ctx.fillStyle = colors.activeBadge;
          ctx.fill();
          ctx.strokeStyle = colors.clusterBorder;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 7px -apple-system, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(ac.activeCount), badgeX, badgeY + 0.5);
        }
      }

      ctx.globalAlpha = 1;

      if (ac.tAlpha > 0) {
        hitTargets.push({
          x: px,
          y: py,
          radius: size + 4,
          markers: ac.markers,
        });
      }
    } else {
      // Solo marker — return position data for DOM element placement
      const ci = ac.sourceIndices[0];
      soloPositions.set(ci, {
        x: px,
        y: py,
        alpha: ac.alpha,
        scale: Math.min(1, ac.size / ac.tSize),
      });

      if (ac.hasActive) {
        const pulseScale = 1 + 0.3 * Math.sin((now / 600) * Math.PI);
        activeGlows.push({
          x: px,
          y: py,
          alpha: ac.alpha,
          radius: 24 * pulseScale,
        });
      }

      hitTargets.push({
        x: px,
        y: py,
        radius: 20,
        markers: ac.markers,
      });
    }
  }

  return { hitTargets, soloPositions, activeGlows };
}

// ── Function 4: renderClusterFrame ──

/** Parameters for a single cluster render frame. */
export interface ClusterFrameParams {
  ctx: CanvasRenderingContext2D;
  clusterData: readonly ClusterDatum[];
  proj: ProjectionParams;
  els: Map<number, HTMLDivElement>;
  prevAnimClusters: readonly AnimCluster[];
  isDragging: boolean;
  hasRenderMarker: boolean;
  colors: ClusterColors & { activeGlow: string };
}

/** Result of a cluster frame render. */
export interface ClusterFrameResult {
  hitTargets: HitTarget[];
  animClusters: AnimCluster[];
  soloPositions: Map<number, { x: number; y: number; alpha: number; scale: number }>;
  activeGlows: ClusterRenderResult['activeGlows'];
}

/**
 * Execute the full cluster rendering pipeline for one animation frame:
 * project → cull DOM → merge → animate → render → position DOM.
 *
 * Pure orchestration function — only draws to ctx and positions DOM elements.
 */
export function renderClusterFrame(params: ClusterFrameParams): ClusterFrameResult {
  const { ctx, clusterData, proj, els, prevAnimClusters, isDragging, hasRenderMarker, colors } = params;
  const now = Date.now();

  // 1. Project clusters to screen space
  const projected = projectClustersToScreen(clusterData, proj);

  // 2. Hide DOM elements for culled clusters
  const projectedIndices = new Set<number>();
  for (const p of projected) {
    for (const si of p.sourceIndices) projectedIndices.add(si);
  }
  for (let ci = 0; ci < clusterData.length; ci++) {
    if (!projectedIndices.has(ci)) {
      const el = els.get(ci);
      if (el) el.style.display = "none";
    }
  }

  // 3. Screen-space merge
  const merged = mergeClusters(projected);

  // 4. Animated cluster transitions
  const lerpSpeed = isDragging ? 0.5 : 0.15;
  const animClusters = animateClusters(merged, prevAnimClusters, lerpSpeed);

  // 5. Render animated clusters
  const renderResult = renderAnimatedClusters(ctx, animClusters, colors, now, hasRenderMarker);

  // 6. Position solo marker DOM elements
  const usedEls = new Set<number>();
  for (const [ci, pos] of renderResult.soloPositions) {
    usedEls.add(ci);
    const el = els.get(ci);
    if (el) {
      el.style.display = "";
      el.style.opacity = String(pos.alpha);
      el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) scale(${pos.scale})`;
    }
  }

  // 7. Draw active glow rings
  for (const glow of renderResult.activeGlows) {
    if (isFinite(glow.radius) && glow.radius > 0) {
      ctx.globalAlpha = glow.alpha;
      ctx.beginPath();
      ctx.arc(glow.x, glow.y, glow.radius, 0, TWO_PI);
      ctx.fillStyle = colors.activeGlow;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // 8. Hide unused DOM elements
  for (const [ci, el] of els) {
    if (!usedEls.has(ci) && !projectedIndices.has(ci)) {
      el.style.display = "none";
    }
  }

  return {
    hitTargets: renderResult.hitTargets,
    animClusters,
    soloPositions: renderResult.soloPositions,
    activeGlows: renderResult.activeGlows,
  };
}
