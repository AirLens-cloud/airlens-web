/**
 * Plain equirectangular lat/lon → SVG pixel projection for `GlobeMapView`.
 * Split out of the component file so `project()` can be unit-tested without
 * tripping the `react-refresh/only-export-components` rule (a component
 * file may only export components).
 */
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';

export const MAP_VIEW_W = 720;
export const MAP_VIEW_H = 360;

/**
 * lat/lon → SVG pixel space, no clamping beyond what finite lat/lon already
 * guarantee (±90/±180). A projection bug and a data-coverage bug both read
 * as "dots in the wrong place" — pinning known coordinates here keeps them
 * distinguishable (see this module's own test + `api/gridSnapshot.test.ts`'s
 * no-origin sampling coverage test).
 */
export function project(lat: number, lon: number): { x: number; y: number } {
  return { x: ((lon + 180) / 360) * MAP_VIEW_W, y: ((90 - lat) / 180) * MAP_VIEW_H };
}

function ringPath(ring: Position[]): string {
  return ring.map(([lon, lat], i) => {
    const { x, y } = project(lat, lon);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join('') + 'Z';
}

export function featurePath(feat: Feature): string {
  const geom = feat.geometry;
  if (geom.type === 'Polygon') return (geom as Polygon).coordinates.map(ringPath).join('');
  if (geom.type === 'MultiPolygon') return (geom as MultiPolygon).coordinates.flat().map(ringPath).join('');
  return '';
}
