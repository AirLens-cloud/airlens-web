/**
 * CoastlineOutlines — nullschool-style continent outlines on the 3D globe.
 *
 * Loads earth-topo.json (already in public/data/) and renders coastline
 * polygons as thin LineSegments with optional additive-blending glow pass.
 * Color adapts to the active theme preset.
 */
import { useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import type { Topology, Objects, GeometryCollection } from 'topojson-specification';
import { feature } from 'topojson-client';
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { VIZ_ACCENT_0X } from '../../../../lib/config/viz';
import { useGlobeStore } from '../../../../store/globeStore';
import { GLOBE_THEME_PRESETS } from '../../../../lib/config/globe';
import { useCountryFeatures } from '../../../../hooks/useCountryData';
import { COUNTRY_BORDER } from '../../../../lib/config/globe-v2';
import {
  buildBorderIndex,
  findSelectedRange,
  type BorderFeatureRange,
} from '../systems/borderIndex';

import { GLOBE_R } from '../systems/geoUtils';
const BORDER_R = GLOBE_R + COUNTRY_BORDER.RADIUS_OFFSET;
const DEG2RAD = Math.PI / 180;

function llToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function ringToPoints(ring: Position[], r: number): THREE.Vector3[] {
  return ring.map(([lon, lat]) => llToVec3(lat!, lon!, r));
}

const CoastlineOutlines = () => {
  const themePreset = useGlobeStore((s) => s.themePreset);
  const selectedCountry = useGlobeStore((s) => s.selectedCountry);
  const preset = GLOBE_THEME_PRESETS[themePreset];
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
  const borderData = useCountryFeatures();

  useEffect(() => {
    let cancelled = false;

    // Load coastlines (separate topo file, not shared)
    fetch('/data/earth-topo.json')
      .then((r) => r.json())
      .then((topo: Topology<Objects>) => {
        if (cancelled) return;
        const key = Object.keys(topo.objects)[0];
        if (!key) return;
        const obj = topo.objects[key] as GeometryCollection;
        const fc = feature(topo, obj) as unknown as FeatureCollection;
        setGeoData(fc);
      })
      .catch(() => { /* topology unavailable */ });

    return () => { cancelled = true; };
  }, []);

  const lineGeometry = useMemo(() => {
    if (!geoData) return null;

    const vertices: number[] = [];

    for (const feat of geoData.features) {
      const geom = feat.geometry;
      let rings: Position[][] = [];

      if (geom.type === 'Polygon') {
        rings = (geom as Polygon).coordinates;
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of (geom as MultiPolygon).coordinates) {
          rings.push(...poly);
        }
      }

      for (const ring of rings) {
        const pts = ringToPoints(ring, GLOBE_R);
        for (let i = 0; i < pts.length - 1; i++) {
          vertices.push(pts[i].x, pts[i].y, pts[i].z);
          vertices.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geo;
  }, [geoData]);

  // Build country border geometry ONCE (at BORDER_R — above coastlines),
  // indexed + per-feature vertex ranges so the selected country's border can
  // be suppressed by rewriting only the index buffer (limb double-border fix).
  const borderBuild = useMemo(() => {
    if (!borderData) return null;

    const vertices: number[] = [];
    const ranges: BorderFeatureRange[] = [];

    for (const feat of borderData.features) {
      const geom = feat.geometry;
      let rings: Position[][] = [];

      if (geom.type === 'Polygon') {
        rings = (geom as Polygon).coordinates;
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of (geom as MultiPolygon).coordinates) {
          rings.push(...poly);
        }
      }

      const start = vertices.length / 3;
      for (const ring of rings) {
        const pts = ringToPoints(ring, BORDER_R);
        for (let i = 0; i < pts.length - 1; i++) {
          vertices.push(pts[i].x, pts[i].y, pts[i].z);
          vertices.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        }
      }
      const count = vertices.length / 3 - start;
      if (count > 0) {
        const props = (feat.properties ?? {}) as Record<string, unknown>;
        ranges.push({
          name: (props.name as string) || '',
          id: String(feat.id ?? ''),
          start,
          count,
        });
      }
    }

    const vertexCount = vertices.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(new THREE.BufferAttribute(buildBorderIndex(vertexCount, null), 1));
    return { geometry: geo, ranges, vertexCount };
  }, [borderData]);

  const borderGeometry = borderBuild?.geometry ?? null;

  // Selected country's border is drawn by CountryExtrude as a cyan fat line at
  // EDGE_R — skip its range here so the two never show as parallel lines at
  // the limb. Index-only rewrite; positions are never rebuilt.
  useEffect(() => {
    if (!borderBuild) return;
    const { geometry, ranges, vertexCount } = borderBuild;
    const excluded = findSelectedRange(ranges, selectedCountry);
    geometry.setIndex(new THREE.BufferAttribute(buildBorderIndex(vertexCount, excluded), 1));
  }, [borderBuild, selectedCountry]);

  // Dispose geometries on unmount or when they change
  useEffect(() => {
    return () => {
      lineGeometry?.dispose();
    };
  }, [lineGeometry]);

  useEffect(() => {
    return () => {
      borderGeometry?.dispose();
    };
  }, [borderGeometry]);

  if (!lineGeometry && !borderGeometry) return null;

  const lineColor = new THREE.Color(preset.land);

  return (
    <group>
      {/* Coastline outlines — bright */}
      {lineGeometry && (
        <>
          <lineSegments geometry={lineGeometry}>
            <lineBasicMaterial
              color={lineColor}
              transparent
              opacity={0.9}
              depthWrite={false}
            />
          </lineSegments>
          {/* Coastline glow (additive) */}
          <lineSegments geometry={lineGeometry}>
            <lineBasicMaterial
              color={VIZ_ACCENT_0X}
              transparent
              opacity={0.2}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </lineSegments>
        </>
      )}

      {/* Country borders — bright enough to distinguish nations */}
      {borderGeometry && (
        <>
          <lineSegments geometry={borderGeometry}>
            <lineBasicMaterial
              color={COUNTRY_BORDER.COLOR}
              transparent
              opacity={COUNTRY_BORDER.OPACITY}
              depthWrite={false}
            />
          </lineSegments>
          {/* Border glow (additive) — teal tint for depth */}
          <lineSegments geometry={borderGeometry}>
            <lineBasicMaterial
              color={COUNTRY_BORDER.GLOW_COLOR}
              transparent
              opacity={COUNTRY_BORDER.GLOW_OPACITY}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </lineSegments>
        </>
      )}
    </group>
  );
};

export default CoastlineOutlines;
