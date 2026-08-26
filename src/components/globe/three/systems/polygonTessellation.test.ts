/**
 * polygonTessellation — sphere-hugging surface + per-ring edge tests (AAA).
 */
import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import type { Position } from 'geojson';
import {
  tessellateSphericalPolygon,
  buildRingEdgeSegments,
  lonLatToVec3,
  type LonLatBBox,
} from './polygonTessellation';

const DEG2RAD = Math.PI / 180;

function bboxOf(rings: Position[][]): LonLatBBox {
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if ((lat as number) < minLat) minLat = lat as number;
      if ((lat as number) > maxLat) maxLat = lat as number;
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

function arcDeg(a: Vector3, b: Vector3): number {
  const d = Math.min(1, Math.max(-1, a.dot(b) / (a.length() * b.length())));
  return Math.acos(d) / DEG2RAD;
}

/** Inverse of lonLatToVec3 — for lon/lat point-in-polygon assertions. */
function vec3ToLonLat(v: Vector3, r: number): { lon: number; lat: number } {
  const lat = 90 - Math.acos(Math.min(1, Math.max(-1, v.y / r))) / DEG2RAD;
  let lon = Math.atan2(v.z, -v.x) / DEG2RAD - 180;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  return { lon, lat };
}

function pointInTriangle2D(
  px: number,
  py: number,
  a: [number, number],
  b: [number, number],
  c: [number, number],
): boolean {
  const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
  const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
  const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

describe('buildRingEdgeSegments', () => {
  it('emits closed loops per ring with no cross-ring segments', () => {
    // Arrange — two disjoint closed square rings (GeoJSON closed: first == last)
    const ringA: Position[] = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
    const ringB: Position[] = [[50, 0], [52, 0], [52, 2], [50, 2], [50, 0]];
    // Act — large threshold ⇒ no subdivision
    const { positions } = buildRingEdgeSegments([ringA, ringB], 1.016, 90);
    // Assert — 4 unique verts per closed ring ⇒ 4 segments each, 8 total
    const segmentCount = positions.length / 6;
    expect(segmentCount).toBe(8);
  });

  it('slerp-subdivides segments longer than the arc threshold', () => {
    // Arrange — a ring with 30° edges, threshold 5°
    const ring: Position[] = [[0, 0], [30, 0], [30, 30], [0, 30], [0, 0]];
    const threshold = 5;
    // Act
    const { positions } = buildRingEdgeSegments([ring], 1.016, threshold);
    // Assert — every emitted segment arc ≤ threshold
    for (let i = 0; i < positions.length; i += 6) {
      const a = new Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const b = new Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
      expect(arcDeg(a, b)).toBeLessThanOrEqual(threshold + 1e-6);
    }
  });

  it('skips degenerate rings (<3 vertices) without throwing', () => {
    // Arrange
    const degenerate: Position[] = [[0, 0], [1, 1]];
    // Act
    const { positions } = buildRingEdgeSegments([degenerate], 1.016, 5);
    // Assert
    expect(positions.length).toBe(0);
  });
});

describe('tessellateSphericalPolygon', () => {
  const RADIUS = 1.015;

  it('cuts holes — no triangle covers a hole interior point, hole ring is in the edge buffer', () => {
    // Arrange — 10° outer square (CCW) with a 4..6 inner hole (CW), Lesotho-style
    const outer: Position[] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const hole: Position[] = [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]];
    const rings: Position[][] = [outer, hole];
    // Act
    const mesh = tessellateSphericalPolygon(rings, RADIUS, { bbox: bboxOf(rings), arcThresholdDeg: 90 });
    // Assert — surface built, no fallback, hole center covered by no triangle
    expect(mesh.usedFallback).toBe(false);
    expect(mesh.indices.length).toBeGreaterThan(0);

    const lonlat: Array<[number, number]> = [];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const { lon, lat } = vec3ToLonLat(
        new Vector3(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]),
        RADIUS,
      );
      lonlat.push([lon, lat]);
    }
    const holeCenter: [number, number] = [5, 5];
    let covered = false;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const a = lonlat[mesh.indices[t]];
      const b = lonlat[mesh.indices[t + 1]];
      const c = lonlat[mesh.indices[t + 2]];
      if (pointInTriangle2D(holeCenter[0], holeCenter[1], a, b, c)) {
        covered = true;
        break;
      }
    }
    expect(covered).toBe(false);

    // hole ring present in edges
    const { positions: edges } = buildRingEdgeSegments([hole], RADIUS, 90);
    expect(edges.length / 6).toBe(4);
  });

  it('subdivides so every triangle edge arc is within threshold, vertices stay on the sphere', () => {
    // Arrange — a large 40° triangle, tight threshold
    const rings: Position[][] = [[[0, 0], [40, 0], [0, 40], [0, 0]]];
    const threshold = 10;
    // Act
    const mesh = tessellateSphericalPolygon(rings, RADIUS, {
      bbox: bboxOf(rings),
      arcThresholdDeg: threshold,
      maxSubdivLevel: 5,
    });
    // Assert — edges within threshold and every vertex radius == RADIUS
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const a = new Vector3().fromArray(mesh.positions, mesh.indices[t] * 3);
      const b = new Vector3().fromArray(mesh.positions, mesh.indices[t + 1] * 3);
      const c = new Vector3().fromArray(mesh.positions, mesh.indices[t + 2] * 3);
      expect(arcDeg(a, b)).toBeLessThanOrEqual(threshold + 1e-6);
      expect(arcDeg(b, c)).toBeLessThanOrEqual(threshold + 1e-6);
      expect(arcDeg(c, a)).toBeLessThanOrEqual(threshold + 1e-6);
    }
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const len = Math.hypot(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
      expect(len).toBeCloseTo(RADIUS, 6);
    }
  });

  it('projects antimeridian polygons without falling back (3D-mean centroid stays interior)', () => {
    // Arrange — a small polygon straddling ±180 (lon 178 .. -178), lat ~0
    const rings: Position[][] = [[[178, -2], [-178, -2], [-178, 2], [178, 2], [178, -2]]];
    // Act
    const mesh = tessellateSphericalPolygon(rings, RADIUS, { bbox: bboxOf(rings), arcThresholdDeg: 90 });
    // Assert — every vertex was in the front hemisphere of the centroid ⇒ no fan fallback
    expect(mesh.usedFallback).toBe(false);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });

  it('falls back gracefully for polygons that exceed a hemisphere', () => {
    // Arrange — an equatorial ring circling the whole globe: 3D-mean centroid
    // collapses toward a pole, leaving vertices ≥90° away ⇒ gnomonic unsafe
    const rings: Position[][] = [[[0, 0], [90, 0], [180, 0], [-90, 0], [0, 0]]];
    // Act
    const mesh = tessellateSphericalPolygon(rings, RADIUS, { bbox: bboxOf(rings), arcThresholdDeg: 90 });
    // Assert — fan fallback used, still yields a surface, still on the sphere
    expect(mesh.usedFallback).toBe(true);
    expect(mesh.indices.length).toBeGreaterThan(0);
    const v = new Vector3().fromArray(mesh.positions, 3);
    expect(v.length()).toBeCloseTo(RADIUS, 6);
  });

  it('returns an empty mesh for degenerate polygons (<3 vertices)', () => {
    // Arrange
    const rings: Position[][] = [[[0, 0], [1, 1]]];
    // Act
    const mesh = tessellateSphericalPolygon(rings, RADIUS, { bbox: bboxOf(rings) });
    // Assert
    expect(mesh.positions.length).toBe(0);
    expect(mesh.indices.length).toBe(0);
  });

  it('keeps flag UVs inside the country bbox range', () => {
    // Arrange
    const rings: Position[][] = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
    // Act
    const mesh = tessellateSphericalPolygon(rings, RADIUS, { bbox: bboxOf(rings), arcThresholdDeg: 90 });
    // Assert — every uv within [−0.01, 1.01]
    for (const uv of mesh.uvs) {
      expect(uv).toBeGreaterThanOrEqual(-0.01);
      expect(uv).toBeLessThanOrEqual(1.01);
    }
  });

  // reference vector used indirectly to keep lonLatToVec3 exercised in the suite
  it('lonLatToVec3 places points at the requested radius', () => {
    const v = lonLatToVec3(37, 127, RADIUS);
    expect(v.length()).toBeCloseTo(RADIUS, 6);
  });
});
