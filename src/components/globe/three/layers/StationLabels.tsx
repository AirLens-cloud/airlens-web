/**
 * StationLabels — visible station/satellite icons with raycaster hit detection.
 *
 * InstancedMesh PlaneGeometry quads with a 2-cell icon atlas texture.
 * Icons billboard toward camera. AQI-based vertex coloring.
 * Replaces the previous invisible hit-test spheres with visible markers.
 */
import { useRef, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { useGlobeMarkers, useDQSSData, lookupDQSSScore, dqssToOpacity } from '../../../../hooks/useGlobeData';
import { useGlobeStore } from '../../../../store/globeStore';
import { GLOBE_COLORS } from '../../../../lib/config/globe-v2';
import { getAQIColor } from '../systems/geoUtils';
import { getStationIconTexture } from '../systems/stationIconAtlas';
import { parseStationData } from '../systems/stationParse';
import { patchMaterialForInstanceAlpha, makeInstanceAlphaAttribute } from '../systems/instanceAlpha';

const ICON_SIZE = 0.012;
const SAT_ICON_SCALE = 1.4;
const MAX_STATIONS = 10000;

import type { StationData } from '../../../../types/globe';

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _dummy = new THREE.Object3D();

const StationLabels = () => {
  const { camera, gl } = useThree();
  const setSelectedStation = useGlobeStore((s) => s.setSelectedStation);
  const setHoveredStation = useGlobeStore((s) => s.setHoveredStation);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const rawMarkers = useGlobeMarkers();

  const stations = useMemo(() => parseStationData(rawMarkers), [rawMarkers]);
  const dqssCache = useDQSSData();

  const texture = useMemo(() => getStationIconTexture(), []);
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(ICON_SIZE, ICON_SIZE);
    geo.setAttribute('instanceAlpha', makeInstanceAlphaAttribute(MAX_STATIONS));
    return geo;
  }, []);

  // Patch the material once for per-instance alpha (DQSS opacity channel below).
  useEffect(() => {
    if (materialRef.current) patchMaterialForInstanceAlpha(materialRef.current);
  }, []);

  // Initialize instance matrices, AQI colors, and DQSS-driven alpha.
  // dqssCache is a dependency so a late-arriving fetch re-runs this and fixes
  // up alpha (init effect fires again once dqssCache resolves).
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || stations.length === 0) return;

    const count = Math.min(stations.length, MAX_STATIONS);
    mesh.count = count;

    const satColor = new THREE.Color(GLOBE_COLORS.STATION_SATELLITE);
    const alphaAttr = mesh.geometry.getAttribute('instanceAlpha') as THREE.InstancedBufferAttribute;

    for (let i = 0; i < count; i++) {
      const s = stations[i];
      _dummy.position.copy(s.position);
      _dummy.scale.setScalar(s.isSatellite ? SAT_ICON_SCALE : 1);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      const color = s.isSatellite ? satColor.clone() : getAQIColor(s.pm25);
      mesh.setColorAt(i, color);

      // Satellite icons carry no DQSS (not a ground station) — always opaque.
      // Ground stations: opacity = data-reliability channel, color stays the
      // AQI grade color untouched (darkening it would misread as a different grade).
      const alpha = s.isSatellite ? 1 : dqssToOpacity(lookupDQSSScore(s.lat, s.lon, dqssCache));
      alphaAttr.setX(i, alpha);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }, [stations, dqssCache]);

  // Billboard + satellite pulse
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || stations.length === 0) return;

    const count = Math.min(stations.length, MAX_STATIONS);
    const camPos = camera.position;
    const t = clock.getElapsedTime();
    const pulse = 1.0 + 0.12 * Math.sin(t * 1.5);

    for (let i = 0; i < count; i++) {
      const s = stations[i];
      _dummy.position.copy(s.position);
      const sc = s.isSatellite ? SAT_ICON_SCALE * pulse : 1;
      _dummy.scale.setScalar(sc);
      _dummy.lookAt(camPos);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  // Raycaster hit detection
  const findStation = useCallback((event: PointerEvent): StationData | null => {
    const mesh = meshRef.current;
    if (!mesh) return null;

    const rect = gl.domElement.getBoundingClientRect();
    _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, camera);

    const intersects = _raycaster.intersectObject(mesh, false);
    if (intersects.length === 0) return null;

    const instanceId = intersects[0].instanceId;
    if (instanceId === undefined) return null;
    return stations[instanceId] ?? null;
  }, [camera, gl, stations]);

  useEffect(() => {
    const canvas = gl.domElement;

    // DQSS 값과 그 출처는 항상 함께 이동한다 — 점수만 떼어 보내면 시드값이 실측처럼 보인다.
    const dqssOf = (lat: number, lon: number) => {
      const score = lookupDQSSScore(lat, lon, dqssCache);
      return {
        dqss: score ?? undefined,
        dqss_provenance: score === null ? undefined : (dqssCache?.provenance ?? undefined),
      };
    };

    const onClick = (e: PointerEvent) => {
      const station = findStation(e);
      if (station) {
        setSelectedStation({
          lat: station.lat,
          lon: station.lon,
          pm25: station.pm25,
          name: station.name,
          p10: station.p10,
          p90: station.p90,
          ...dqssOf(station.lat, station.lon),
          source: station.source,
          station_uid: station.stationUid,
        });
      } else {
        setSelectedStation(null);
      }
    };

    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const onMove = (e: PointerEvent) => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => { throttleTimer = null; }, 50);
      const station = findStation(e);
      if (station) {
        setHoveredStation({
          lat: station.lat,
          lon: station.lon,
          pm25: station.pm25,
          name: station.name,
          ...dqssOf(station.lat, station.lon),
        });
      } else {
        setHoveredStation(null);
      }
    };

    canvas.addEventListener('pointerdown', onClick);
    canvas.addEventListener('pointermove', onMove);
    return () => {
      canvas.removeEventListener('pointerdown', onClick);
      canvas.removeEventListener('pointermove', onMove);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [gl, findStation, setSelectedStation, setHoveredStation, dqssCache]);

  if (stations.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, MAX_STATIONS]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        opacity={0.9}
        depthWrite={false}
        alphaTest={0.05}
        side={THREE.DoubleSide}
        vertexColors
      />
    </instancedMesh>
  );
};

export default StationLabels;
