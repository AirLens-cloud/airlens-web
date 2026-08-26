/**
 * CountryClickHandler — click globe → identify country → update store.
 *
 * Raycaster → hit point → lat/lon → point-in-polygon against countries.
 */
import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { useGlobeStore } from '../../../store/globeStore';
import { useCountryFeatures } from '../../../hooks/useCountryData';
import { getIso2FromNumeric, getFlagEmoji } from '../../../lib/config/isoCountries';
import { pointInPolygon, featureCentroid } from '../../../lib/earth/geo';

const RAD2DEG = 180 / Math.PI;

function xyzToLatLon(point: THREE.Vector3): { lat: number; lon: number } {
  const r = point.length();
  const lat = Math.asin(point.y / r) * RAD2DEG;
  const lon = Math.atan2(point.z, -point.x) * RAD2DEG - 180;
  return { lat, lon: lon < -180 ? lon + 360 : lon > 180 ? lon - 360 : lon };
}

const CountryClickHandler = () => {
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const countriesRef = useRef<FeatureCollection | null>(null);
  const setSelectedCountry = useGlobeStore((s) => s.setSelectedCountry);

  // Reusable hit-test sphere (attached to nothing, just for geometry intersection)
  const hitSphere = useRef<THREE.Mesh>(
    new THREE.Mesh(new THREE.SphereGeometry(1.01, 32, 32)),
  );

  useEffect(() => {
    // Ensure world matrix is identity (centered at origin)
    hitSphere.current.updateMatrixWorld(true);

    // Dispose hit-test geometry and material on unmount
    const mesh = hitSphere.current;
    return () => {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
    };
  }, []);

  const sharedCountries = useCountryFeatures();
  useEffect(() => {
    countriesRef.current = sharedCountries;
  }, [sharedCountries]);

  const handleClick = useCallback((event: MouseEvent) => {
    const countries = countriesRef.current;
    if (!countries) return;

    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    raycaster.current.setFromCamera(mouse, camera);
    const hits = raycaster.current.intersectObject(hitSphere.current);

    if (hits.length === 0) {
      setSelectedCountry(null);
      return;
    }

    const { lat, lon } = xyzToLatLon(hits[0].point);

    for (const feat of countries.features) {
      const geom = feat.geometry as Polygon | MultiPolygon;
      if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') continue;

      if (pointInPolygon(lat, lon, geom)) {
        const props = (feat.properties ?? {}) as Record<string, unknown>;
        const name = (props.name as string) || 'Unknown';
        const centroid = featureCentroid(feat);
        // Use feature id + name as code (no ISO in this dataset)
        const code = String(feat.id ?? name);
        const iso2 = getIso2FromNumeric(feat.id);
        const flag = iso2 ? getFlagEmoji(iso2) : '';

        setSelectedCountry({
          code,
          name,
          flag,
          lat: centroid.lat,
          lon: centroid.lon,
        });
        return;
      }
    }

    // Clicked ocean → deselect
    setSelectedCountry(null);
  }, [camera, gl, setSelectedCountry]);

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [gl, handleClick]);

  return null;
};

export default CountryClickHandler;
