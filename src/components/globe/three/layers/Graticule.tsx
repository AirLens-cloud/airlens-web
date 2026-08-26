/**
 * Graticule — latitude/longitude grid lines on the 3D globe.
 *
 * 15-degree intervals with equator/prime meridian emphasis.
 * Polar fade reduces visual noise near poles.
 * Color and opacity adapt to the active theme preset.
 */
import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGlobeStore } from '../../../../store/globeStore';
import { GLOBE_THEME_PRESETS } from '../../../../lib/config/globe';

import { GLOBE_R } from '../systems/geoUtils';
const DEG2RAD = Math.PI / 180;
const STEP = 15;

function llToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

interface GratLine {
  vertices: Float32Array;
  opacity: number;
}

function buildGraticule(baseOpacity: number): GratLine[] {
  const lines: GratLine[] = [];

  // Latitude lines
  for (let lat = -75; lat <= 75; lat += STEP) {
    const verts: number[] = [];
    for (let lon = -180; lon <= 180; lon += 4) {
      const p = llToVec3(lat, lon, GLOBE_R);
      verts.push(p.x, p.y, p.z);
    }
    const latFade = 1 - Math.abs(lat) / 95;
    const isEquator = Math.abs(lat) < 0.5;
    const opacity = baseOpacity * latFade * (isEquator ? 2.2 : 1);

    // Convert points to line segments (pairs)
    const segVerts: number[] = [];
    for (let i = 0; i < verts.length / 3 - 1; i++) {
      segVerts.push(
        verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2],
        verts[i * 3 + 3], verts[i * 3 + 4], verts[i * 3 + 5],
      );
    }
    lines.push({ vertices: new Float32Array(segVerts), opacity });
  }

  // Longitude lines
  for (let lon = -180; lon < 180; lon += STEP) {
    const verts: number[] = [];
    for (let lat = -90; lat <= 90; lat += 4) {
      const p = llToVec3(lat, lon, GLOBE_R);
      verts.push(p.x, p.y, p.z);
    }
    const isMeridian = Math.abs(lon) < 0.5 || Math.abs(Math.abs(lon) - 180) < 0.5;
    const opacity = baseOpacity * (isMeridian ? 1.8 : 1);

    const segVerts: number[] = [];
    for (let i = 0; i < verts.length / 3 - 1; i++) {
      segVerts.push(
        verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2],
        verts[i * 3 + 3], verts[i * 3 + 4], verts[i * 3 + 5],
      );
    }
    lines.push({ vertices: new Float32Array(segVerts), opacity });
  }

  return lines;
}

const Graticule = () => {
  const themePreset = useGlobeStore((s) => s.themePreset);
  const preset = GLOBE_THEME_PRESETS[themePreset];

  const gratLines = useMemo(() => buildGraticule(preset.graticuleOpacity), [preset.graticuleOpacity]);
  const color = useMemo(() => new THREE.Color(preset.graticule), [preset.graticule]);

  // Build geometries from grat lines and dispose on change/unmount
  const geometries = useMemo(() => {
    return gratLines.map((line) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(line.vertices, 3));
      return geo;
    });
  }, [gratLines]);

  const geometriesRef = useRef(geometries);
  geometriesRef.current = geometries; // eslint-disable-line react-hooks/refs -- sync ref for cleanup

  useEffect(() => {
    return () => {
      for (const geo of geometriesRef.current) {
        geo.dispose();
      }
    };
  }, [geometries]);

  return (
    <group>
      {gratLines.map((line, i) => (
        <lineSegments key={`grat-${line.opacity}-${i}`} geometry={geometries[i]}>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={line.opacity}
            depthWrite={false}
          />
        </lineSegments>
      ))}
    </group>
  );
};

export default Graticule;
