/**
 * StationLabels — visible station/satellite icons with raycaster hit detection.
 *
 * Two InstancedMesh groups (ground vs. satellite-derived) so each can carry
 * its own glyph sprite (`station-ground.png` / `station-satellite.png`,
 * stationIconAtlas) — a single InstancedMesh can only bind one texture, and
 * the two sources are meant to read as visually distinct shapes, not just
 * different vertex colors. Icons billboard toward camera. AQI-based vertex
 * coloring.
 */
import { useRef, useEffect, useMemo, useCallback, type RefObject } from 'react';
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

/** One instanced-mesh group (ground or satellite), each keeping its own local index. */
interface StationGroup {
  stations: StationData[];
  meshRef: RefObject<THREE.InstancedMesh | null>;
  materialRef: RefObject<THREE.MeshBasicMaterial | null>;
  texture: THREE.Texture;
  geometry: THREE.BufferGeometry;
  isSatellite: boolean;
}

const StationLabels = () => {
  const { camera, gl } = useThree();
  const setSelectedStation = useGlobeStore((s) => s.setSelectedStation);
  const setHoveredStation = useGlobeStore((s) => s.setHoveredStation);
  const meshGroundRef = useRef<THREE.InstancedMesh>(null);
  const meshSatRef = useRef<THREE.InstancedMesh>(null);
  const materialGroundRef = useRef<THREE.MeshBasicMaterial>(null);
  const materialSatRef = useRef<THREE.MeshBasicMaterial>(null);
  const rawMarkers = useGlobeMarkers();

  const allStations = useMemo(() => parseStationData(rawMarkers), [rawMarkers]);
  const groundStations = useMemo(() => allStations.filter((s) => !s.isSatellite), [allStations]);
  const satStations = useMemo(() => allStations.filter((s) => s.isSatellite), [allStations]);
  const dqssCache = useDQSSData();

  const textureGround = useMemo(() => getStationIconTexture(false), []);
  const textureSat = useMemo(() => getStationIconTexture(true), []);
  const geometryGround = useMemo(() => {
    const geo = new THREE.PlaneGeometry(ICON_SIZE, ICON_SIZE);
    geo.setAttribute('instanceAlpha', makeInstanceAlphaAttribute(MAX_STATIONS));
    return geo;
  }, []);
  const geometrySat = useMemo(() => {
    const geo = new THREE.PlaneGeometry(ICON_SIZE, ICON_SIZE);
    geo.setAttribute('instanceAlpha', makeInstanceAlphaAttribute(MAX_STATIONS));
    return geo;
  }, []);

  // Deliberately NOT useMemo: react-hooks/immutability (eslint-plugin-react-hooks v7,
  // React Compiler-derived) flags any InstancedMesh mutation reached through a
  // memoized array's `.meshRef.current` as "mutating a memoized value" — a plain
  // per-render array of stable refs sidesteps it (see PredictionMarkers.tsx `tiers`
  // for the same pattern + fuller rationale).
  const groups: StationGroup[] = [
    { stations: groundStations, meshRef: meshGroundRef, materialRef: materialGroundRef, texture: textureGround, geometry: geometryGround, isSatellite: false },
    { stations: satStations, meshRef: meshSatRef, materialRef: materialSatRef, texture: textureSat, geometry: geometrySat, isSatellite: true },
  ];

  // Patch both materials once for per-instance alpha (DQSS opacity channel below).
  useEffect(() => {
    if (materialGroundRef.current) patchMaterialForInstanceAlpha(materialGroundRef.current);
    if (materialSatRef.current) patchMaterialForInstanceAlpha(materialSatRef.current);
  }, []);

  // Initialize instance matrices, AQI colors, and DQSS-driven alpha (both groups).
  // dqssCache is a dependency so a late-arriving fetch re-runs this and fixes
  // up alpha (init effect fires again once dqssCache resolves).
  /* eslint-disable react-hooks/immutability -- imperative Three.js InstancedMesh mutation (R3F escape hatch); the compiler-derived rule reports at the hook call itself so the whole statement is wrapped, not just the inner body */
  useEffect(() => {
    const satColor = new THREE.Color(GLOBE_COLORS.STATION_SATELLITE);

    for (const group of groups) {
      const mesh = group.meshRef.current;
      if (!mesh || group.stations.length === 0) {
        if (mesh) mesh.count = 0;
        continue;
      }

      const count = Math.min(group.stations.length, MAX_STATIONS);
      mesh.count = count;
      const alphaAttr = mesh.geometry.getAttribute('instanceAlpha') as THREE.InstancedBufferAttribute;

      for (let i = 0; i < count; i++) {
        const s = group.stations[i];
        _dummy.position.copy(s.position);
        _dummy.scale.setScalar(group.isSatellite ? SAT_ICON_SCALE : 1);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);

        const color = group.isSatellite ? satColor.clone() : getAQIColor(s.pm25);
        mesh.setColorAt(i, color);

        // Satellite icons carry no DQSS (not a ground station) — always opaque.
        // Ground stations: opacity = data-reliability channel, color stays the
        // AQI grade color untouched (darkening it would misread as a different grade).
        const alpha = group.isSatellite ? 1 : dqssToOpacity(lookupDQSSScore(s.lat, s.lon, dqssCache));
        alphaAttr.setX(i, alpha);
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      alphaAttr.needsUpdate = true;
    }
    // `groups` itself is rebuilt every render from groundStations/satStations + stable
    // refs — depend on the actual changing inputs so this doesn't re-run on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groundStations, satStations, dqssCache]);
  /* eslint-enable react-hooks/immutability */

  // Billboard + satellite pulse (both groups).
  /* eslint-disable react-hooks/immutability -- imperative Three.js InstancedMesh mutation in the R3F render loop (see note on the init effect above) */
  useFrame(({ clock }) => {
    const camPos = camera.position;
    const t = clock.getElapsedTime();
    const pulse = 1.0 + 0.12 * Math.sin(t * 1.5);

    for (const group of groups) {
      const mesh = group.meshRef.current;
      if (!mesh || group.stations.length === 0) continue;
      const count = Math.min(group.stations.length, MAX_STATIONS);
      const sc = group.isSatellite ? SAT_ICON_SCALE * pulse : 1;

      for (let i = 0; i < count; i++) {
        _dummy.position.copy(group.stations[i].position);
        _dummy.scale.setScalar(sc);
        _dummy.lookAt(camPos);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });
  /* eslint-enable react-hooks/immutability */

  // Raycaster hit detection — across both groups, closest hit wins.
  const findStation = useCallback((event: PointerEvent): StationData | null => {
    const meshes = groups.map((g) => g.meshRef.current).filter((m): m is THREE.InstancedMesh => !!m);
    if (meshes.length === 0) return null;

    const rect = gl.domElement.getBoundingClientRect();
    _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, camera);

    const intersects = _raycaster.intersectObjects(meshes, false);
    if (intersects.length === 0) return null;

    const hit = intersects[0];
    const instanceId = hit.instanceId;
    if (instanceId === undefined) return null;
    const group = groups.find((g) => g.meshRef.current === hit.object);
    return group?.stations[instanceId] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `groups` rebuilt from groundStations/satStations + stable refs, see note above
  }, [camera, gl, groundStations, satStations]);

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
        const dqssInfo = dqssOf(station.lat, station.lon);
        setSelectedStation({
          lat: station.lat,
          lon: station.lon,
          pm25: station.pm25,
          name: station.name,
          p10: station.p10,
          p90: station.p90,
          ...dqssInfo,
          // 상세는 'partial' 일 때만 함께 이동 — 다른 provenance 에 잘못 붙지 않게.
          dqss_partial_detail: dqssInfo.dqss_provenance === 'partial' ? (dqssCache?.partialDetail ?? undefined) : undefined,
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

  // Sprite textures come from spriteKit's shared cache (systems/spriteKit.ts) —
  // only the locally-owned geometries are disposed here.
  useEffect(() => {
    return () => {
      geometryGround.dispose();
      geometrySat.dispose();
    };
  }, [geometryGround, geometrySat]);

  if (allStations.length === 0) return null;

  return (
    <>
      <instancedMesh
        ref={meshGroundRef}
        args={[geometryGround, undefined, MAX_STATIONS]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          ref={materialGroundRef}
          map={textureGround}
          transparent
          opacity={0.9}
          depthWrite={false}
          alphaTest={0.05}
          side={THREE.DoubleSide}
          vertexColors
        />
      </instancedMesh>
      <instancedMesh
        ref={meshSatRef}
        args={[geometrySat, undefined, MAX_STATIONS]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          ref={materialSatRef}
          map={textureSat}
          transparent
          opacity={0.9}
          depthWrite={false}
          alphaTest={0.05}
          side={THREE.DoubleSide}
          vertexColors
        />
      </instancedMesh>
    </>
  );
};

export default StationLabels;
