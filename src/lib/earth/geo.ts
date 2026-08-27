import type { Feature, Polygon, MultiPolygon, Position } from 'geojson'

/** Shortest-path longitude delta, wrapped to [-180, 180] — avoids the ~360° cliff at the date line. */
export function wrapDeltaLon(dLon: number): number {
  if (dLon > 180) return dLon - 360
  if (dLon < -180) return dLon + 360
  return dLon
}

/** Ray-casting point-in-ring test. ring = [lon, lat] positions, geographic degrees. */
export function pointInRing(lat: number, lon: number, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]!
    const xj = ring[j][0], yj = ring[j][1]!
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

/** Point-in-polygon test against a (Multi)Polygon geometry (outer rings only). */
export function pointInPolygon(lat: number, lon: number, geom: Polygon | MultiPolygon): boolean {
  if (geom.type === 'Polygon') {
    return pointInRing(lat, lon, geom.coordinates[0])
  }
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (pointInRing(lat, lon, poly[0])) return true
    }
  }
  return false
}

/** Approximate centroid (average of outer-ring vertices) of a Polygon/MultiPolygon feature. */
export function featureCentroid(feat: Feature): { lat: number; lon: number } {
  const coords: Position[] = []
  const geom = feat.geometry
  if (geom.type === 'Polygon') coords.push(...(geom as Polygon).coordinates[0])
  else if (geom.type === 'MultiPolygon') {
    for (const poly of (geom as MultiPolygon).coordinates) coords.push(...poly[0])
  }
  if (coords.length === 0) return { lat: 0, lon: 0 }
  let lonSum = 0, latSum = 0
  for (const [ln, lt] of coords) { lonSum += ln; latSum += lt! }
  return { lat: latSum / coords.length, lon: lonSum / coords.length }
}
