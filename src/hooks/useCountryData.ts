/**
 * useCountryData — shared TopoJSON country data for Globe layers.
 *
 * Fetches countries-50m.json ONCE and shares via module-level cache.
 * Prevents 3 duplicate fetches from CountryClickHandler, CountryExtrude, CoastlineOutlines.
 */
import { useState, useEffect } from 'react';
import type { Topology, Objects, GeometryCollection } from 'topojson-specification';
import { feature } from 'topojson-client';
import type { FeatureCollection } from 'geojson';

// ── Module-level singleton ──

let cachedFeatures: FeatureCollection | null = null;
let inflight: Promise<FeatureCollection | null> | null = null;

async function loadCountries(): Promise<FeatureCollection | null> {
  if (cachedFeatures) return cachedFeatures;

  if (!inflight) {
    inflight = fetch('/data/countries-50m.json')
      .then((r) => r.json())
      .then((topo: Topology<Objects>) => {
        const obj = topo.objects['countries'] as GeometryCollection | undefined;
        if (!obj) return null;
        cachedFeatures = feature(topo, obj) as unknown as FeatureCollection;
        inflight = null;
        return cachedFeatures;
      })
      .catch(() => {
        inflight = null;
        return null;
      });
  }

  return inflight;
}

/**
 * Hook: returns shared parsed country FeatureCollection.
 * Multiple components calling this hook result in only 1 fetch + parse.
 */
export function useCountryFeatures(): FeatureCollection | null {
  const [countries, setCountries] = useState<FeatureCollection | null>(cachedFeatures);

  useEffect(() => {
    let cancelled = false;
    loadCountries().then((data) => {
      if (!cancelled) setCountries(data);
    });
    return () => { cancelled = true; };
  }, []);

  return countries;
}
