/**
 * polygonTessellation — pure geometry helpers for country selection rendering.
 *
 * Turns GeoJSON polygons (outer ring + holes) into sphere-hugging triangle
 * meshes and per-ring edge segment buffers, with no dependency beyond three's
 * math + ShapeUtils (earcut). Kept side-effect free so it is unit-testable.
 *
 * Two failure modes it exists to remove:
 *  - centroid-fan triangulation spilling outside concave / multi-polygon borders
 *  - a single concatenated line loop drawing ghost segments across the sea
 *    between disjoint rings.
 */
import { ShapeUtils, Vector2, Vector3 } from 'three';
import type { Position } from 'geojson';

const DEG2RAD = Math.PI / 180;

export interface LonLatBBox {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

export interface TessellateOpts {
  /** country-wide bbox in [lon, lat] — shared by every polygon for a coherent flag UV */
  bbox: LonLatBBox;
  /** subdivide any triangle edge whose great-circle arc exceeds this (deg). default 4 */
  arcThresholdDeg?: number;
  /** max midpoint-subdivision recursion depth. default 3 */
  maxSubdivLevel?: number;
  /** dot(vertex, centroid) at or below this ⇒ vertex beyond front hemisphere ⇒ fan fallback. default 1e-3 */
  frontEps?: number;
}

export interface TessellatedMesh {
  /** flat xyz, length = vertexCount * 3 */
  positions: number[];
  /** flat uv, length = vertexCount * 2 */
  uvs: number[];
  /** triangle vertex indices, length = triangleCount * 3 */
  indices: number[];
  /** true when gnomonic projection was unsafe and the coarse centroid fan was used */
  usedFallback: boolean;
}

export interface EdgeSegments {
  /** flat xyz; each consecutive pair of vertices (6 floats) is one line segment */
  positions: number[];
}

/** GeoJSON [lon, lat] → point on sphere of given radius. */
export function lonLatToVec3(lon: number, lat: number, r: number): Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return new Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

/** Inverse of {@link lonLatToVec3} — recovers [lon, lat] from a sphere point. */
function vec3ToLonLat(v: Vector3, r: number): { lon: number; lat: number } {
  const lat = 90 - Math.acos(clamp(v.y / r, -1, 1)) / DEG2RAD;
  let lon = Math.atan2(v.z, -v.x) / DEG2RAD - 180;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  return { lon, lat };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Great-circle arc between two same-radius sphere points, in degrees. */
function arcDeg(a: Vector3, b: Vector3): number {
  const d = clamp(a.dot(b) / (a.length() * b.length()), -1, 1);
  return Math.acos(d) / DEG2RAD;
}

/** Great-circle midpoint at the same radius (equal-weight slerp reduces to this). */
function sphericalMidpoint(a: Vector3, b: Vector3, r: number): Vector3 {
  return a.clone().add(b).normalize().multiplyScalar(r);
}

/** Spherical linear interpolation between two same-radius points. */
function slerp(a: Vector3, b: Vector3, t: number, r: number): Vector3 {
  const ua = a.clone().normalize();
  const ub = b.clone().normalize();
  const omega = Math.acos(clamp(ua.dot(ub), -1, 1));
  if (omega < 1e-6) return a.clone();
  const so = Math.sin(omega);
  const s0 = Math.sin((1 - t) * omega) / so;
  const s1 = Math.sin(t * omega) / so;
  return ua.multiplyScalar(s0).add(ub.multiplyScalar(s1)).normalize().multiplyScalar(r);
}

/** Drop a ring's trailing closing vertex (GeoJSON rings repeat the first point). */
function openRing(ring: Position[]): Position[] {
  if (ring.length < 2) return ring.slice();
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring.slice();
}

/** 3D unit-vector mean of a ring, normalized — antimeridian-safe centroid direction. */
function ringCentroidDir(ring: Position[]): Vector3 {
  const acc = new Vector3();
  for (const [lon, lat] of ring) {
    acc.add(lonLatToVec3(lon, lat as number, 1));
  }
  if (acc.lengthSq() < 1e-12) return new Vector3(0, 1, 0);
  return acc.normalize();
}

/** Orthonormal tangent basis (east, north) at a unit centroid direction. */
function tangentBasis(c: Vector3): { east: Vector3; north: Vector3 } {
  const up = Math.abs(c.y) > 0.999 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const east = new Vector3().crossVectors(up, c).normalize();
  const north = new Vector3().crossVectors(c, east).normalize();
  return { east, north };
}

/** Assign flag UVs from country-wide bbox by inverting each vertex to [lon, lat]. */
function computeUvs(positions: number[], r: number, bbox: LonLatBBox): number[] {
  const lonRange = Math.max(bbox.maxLon - bbox.minLon, 0.01);
  const latRange = Math.max(bbox.maxLat - bbox.minLat, 0.01);
  const uvs: number[] = [];
  const v = new Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    v.set(positions[i], positions[i + 1], positions[i + 2]);
    const { lon, lat } = vec3ToLonLat(v, r);
    uvs.push((lon - bbox.minLon) / lonRange, (lat - bbox.minLat) / latRange);
  }
  return uvs;
}

/** Coarse centroid fan over the outer ring — fallback when gnomonic projection is unsafe. */
function fanFallback(outer: Position[], radius: number): { verts: Vector3[]; tris: number[] } {
  const verts: Vector3[] = [];
  const tris: number[] = [];
  const dir = ringCentroidDir(outer);
  const center = dir.clone().multiplyScalar(radius);
  const centerIdx = 0;
  verts.push(center);
  for (const [lon, lat] of outer) {
    verts.push(lonLatToVec3(lon, lat as number, radius));
  }
  const n = outer.length;
  for (let i = 0; i < n; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % n);
    tris.push(centerIdx, a, b);
  }
  return { verts, tris };
}

/**
 * Tessellate one GeoJSON polygon (outer ring + optional holes) into a
 * sphere-hugging triangle mesh. Projects to the centroid tangent plane
 * (gnomonic), triangulates with earcut, then midpoint-subdivides long edges.
 */
export function tessellateSphericalPolygon(
  rings: Position[][],
  radius: number,
  opts: TessellateOpts,
): TessellatedMesh {
  const arcThreshold = opts.arcThresholdDeg ?? 4;
  const maxLevel = opts.maxSubdivLevel ?? 3;
  const frontEps = opts.frontEps ?? 1e-3;

  const outer = rings.length > 0 ? openRing(rings[0]) : [];
  if (outer.length < 3) {
    return { positions: [], uvs: [], indices: [], usedFallback: false };
  }

  const holes = rings.slice(1).map(openRing).filter((h) => h.length >= 3);

  const centroid = ringCentroidDir(outer);

  // Front-hemisphere check across every vertex — gnomonic explodes near the horizon.
  const allRings = [outer, ...holes];
  let projectable = true;
  for (const ring of allRings) {
    for (const [lon, lat] of ring) {
      const u = lonLatToVec3(lon, lat as number, 1);
      if (u.dot(centroid) <= frontEps) {
        projectable = false;
        break;
      }
    }
    if (!projectable) break;
  }

  let verts: Vector3[];
  let tris: number[];
  let usedFallback = false;

  if (!projectable) {
    const fb = fanFallback(outer, radius);
    verts = fb.verts;
    tris = fb.tris;
    usedFallback = true;
  } else {
    const { east, north } = tangentBasis(centroid);
    const contour2D: Vector2[] = [];
    const combined3D: Vector3[] = [];

    const project = (ring: Position[], into: Vector2[]): void => {
      for (const [lon, lat] of ring) {
        const p = lonLatToVec3(lon, lat as number, 1);
        const scale = 1 / p.dot(centroid);
        into.push(new Vector2(p.dot(east) * scale, p.dot(north) * scale));
        combined3D.push(lonLatToVec3(lon, lat as number, radius));
      }
    };

    project(outer, contour2D);
    const holes2D: Vector2[][] = [];
    for (const hole of holes) {
      const h2: Vector2[] = [];
      project(hole, h2);
      holes2D.push(h2);
    }

    const faces = ShapeUtils.triangulateShape(contour2D, holes2D);
    verts = combined3D;
    tris = [];
    for (const [a, b, c] of faces) tris.push(a, b, c);
  }

  subdivideLongEdges(verts, tris, radius, arcThreshold, maxLevel);

  const positions: number[] = [];
  for (const v of verts) positions.push(v.x, v.y, v.z);
  const uvs = computeUvs(positions, radius, opts.bbox);

  return { positions, uvs, indices: tris, usedFallback };
}

/** In-place midpoint subdivision: split triangles whose longest edge arc exceeds threshold. */
function subdivideLongEdges(
  verts: Vector3[],
  tris: number[],
  radius: number,
  arcThreshold: number,
  maxLevel: number,
): void {
  const midCache = new Map<string, number>();

  const midpoint = (i: number, j: number): number => {
    const key = i < j ? `${i}_${j}` : `${j}_${i}`;
    const cached = midCache.get(key);
    if (cached !== undefined) return cached;
    const m = sphericalMidpoint(verts[i], verts[j], radius);
    const idx = verts.length;
    verts.push(m);
    midCache.set(key, idx);
    return idx;
  };

  for (let level = 0; level < maxLevel; level++) {
    let split = false;
    const next: number[] = [];
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t];
      const b = tris[t + 1];
      const c = tris[t + 2];
      const longest = Math.max(
        arcDeg(verts[a], verts[b]),
        arcDeg(verts[b], verts[c]),
        arcDeg(verts[c], verts[a]),
      );
      if (longest <= arcThreshold) {
        next.push(a, b, c);
        continue;
      }
      split = true;
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    tris.length = 0;
    for (const idx of next) tris.push(idx);
    if (!split) break;
  }
}

/**
 * Build closed-loop edge segments for a set of rings. Each ring becomes its own
 * closed polyline — no segment is ever drawn between two different rings, so
 * disjoint islands and inner holes never sprout ghost lines across the void.
 * Segments longer than {@link arcThresholdDeg} are slerp-subdivided to hug the sphere.
 */
export function buildRingEdgeSegments(
  rings: Position[][],
  radius: number,
  arcThresholdDeg: number,
): EdgeSegments {
  const positions: number[] = [];

  for (const raw of rings) {
    const ring = openRing(raw);
    if (ring.length < 3) continue;

    const pts = ring.map(([lon, lat]) => lonLatToVec3(lon, lat as number, radius));
    const n = pts.length;

    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const arc = arcDeg(a, b);
      const steps = arc > arcThresholdDeg ? Math.ceil(arc / arcThresholdDeg) : 1;

      let prev = a;
      for (let s = 1; s <= steps; s++) {
        const cur = s === steps ? b : slerp(a, b, s / steps, radius);
        positions.push(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z);
        prev = cur;
      }
    }
  }

  return { positions };
}
