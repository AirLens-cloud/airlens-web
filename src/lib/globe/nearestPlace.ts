/**
 * nearestPlace — reverse-geocode a grid cell's lat/lon against the country
 * polygons the 3D scene already loads for country click-hit-testing
 * (`hooks/useCountryData.ts`, shared single fetch + cache). Reuses the exact
 * point-in-polygon test `CountryClickHandler` uses, so "the country under
 * this point" is one code path, not two that could drift.
 *
 * No city-level table exists in this repo — a cell with no matching country
 * polygon (open ocean, or `countries` not loaded yet) returns `null` rather
 * than a fabricated place name. Callers fall back to showing coordinates.
 */
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { pointInPolygon } from '../earth/geo';

export function nearestPlaceFor(
  lat: number,
  lon: number,
  countries: FeatureCollection | null,
): string | null {
  if (!countries) return null;
  for (const feat of countries.features) {
    const geom = feat.geometry as Polygon | MultiPolygon;
    if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') continue;
    if (pointInPolygon(lat, lon, geom)) {
      const props = (feat.properties ?? {}) as Record<string, unknown>;
      const name = typeof props.name === 'string' ? props.name : null;
      return name;
    }
  }
  return null;
}
