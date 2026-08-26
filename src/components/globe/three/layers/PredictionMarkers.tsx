/**
 * PredictionMarkers — 자체 ML(AODtoPM25 v2) 도시 예측 마커.
 *
 * 관측소(StationLabels)와 의도적으로 다르게 보인다: 채운 관측소 아이콘 대신
 * hollow 링 + 중앙 조준점(p50). 예측을 실측처럼 섞지 않기 위함(§5 Glass-box).
 * 색은 p50 의 AQI 색 — 예측 농도는 색으로, "예측임"은 링 형태로 이중 부호화.
 *
 * pointer 리스너는 관측소 레이어와 별개의 store 슬롯(hoveredPrediction /
 * selectedPrediction)에 쓴다 — 두 레이어가 서로의 null 을 덮어써 깜빡이는 경합을 피한다.
 */
import { useRef, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { usePredictionMarkers } from '../../../../hooks/useGlobeData';
import { useGlobeStore } from '../../../../store/globeStore';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';
import { getAQIColor } from '../systems/geoUtils';
import { parsePredictionData, bandRelWidthToAlpha } from '../systems/predictionParse';
import { patchMaterialForInstanceAlpha, makeInstanceAlphaAttribute } from '../systems/instanceAlpha';
import type { PredictionMarker } from '../../../../types/globe';

const CFG = GLOBE_CONFIG.ML_PREDICTIONS;

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _dummy = new THREE.Object3D();

/** Hollow ring + center dot (crosshair) texture — 관측소 아이콘과 시각 구분. */
function createRingTexture(): THREE.CanvasTexture {
  const size = CFG.RING_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const stroke = size * CFG.RING_STROKE_FRAC;
  ctx.clearRect(0, 0, size, size);
  // Outer ring (white — vertexColors 가 AQI 색으로 틴트)
  ctx.lineWidth = stroke;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(c, c, c * 0.92 - stroke / 2, 0, Math.PI * 2);
  ctx.stroke();
  // Center dot = p50 중앙 추정
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(c, c, size * CFG.RING_DOT_FRAC, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const PredictionMarkers = () => {
  const { camera, gl } = useThree();
  const setSelectedPrediction = useGlobeStore((s) => s.setSelectedPrediction);
  const setHoveredPrediction = useGlobeStore((s) => s.setHoveredPrediction);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const rawPredictions = usePredictionMarkers();

  const markers = useMemo(() => parsePredictionData(rawPredictions), [rawPredictions]);

  const texture = useMemo(() => createRingTexture(), []);
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(CFG.ICON_SIZE, CFG.ICON_SIZE);
    geo.setAttribute('instanceAlpha', makeInstanceAlphaAttribute(CFG.MAX_MARKERS));
    return geo;
  }, []);

  // Patch the material once for per-instance alpha (band-width uncertainty channel below).
  useEffect(() => {
    if (materialRef.current) patchMaterialForInstanceAlpha(materialRef.current);
  }, []);

  // Initialize instance matrices + AQI colors from p50 + alpha from band width.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || markers.length === 0) return;

    const count = Math.min(markers.length, CFG.MAX_MARKERS);
    mesh.count = count;

    const alphaAttr = mesh.geometry.getAttribute('instanceAlpha') as THREE.InstancedBufferAttribute;

    for (let i = 0; i < count; i++) {
      const m = markers[i];
      _dummy.position.copy(m.position);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      mesh.setColorAt(i, getAQIColor(m.p50));
      alphaAttr.setX(i, bandRelWidthToAlpha(m.p10, m.p50, m.p90));
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }, [markers]);

  // Billboard toward camera.
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || markers.length === 0) return;

    const count = Math.min(markers.length, CFG.MAX_MARKERS);
    const camPos = camera.position;

    for (let i = 0; i < count; i++) {
      _dummy.position.copy(markers[i].position);
      _dummy.lookAt(camPos);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  const findMarker = useCallback((event: PointerEvent): PredictionMarker | null => {
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
    return markers[instanceId] ?? null;
  }, [camera, gl, markers]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onClick = (e: PointerEvent) => {
      const m = findMarker(e);
      if (m) {
        setSelectedPrediction({
          name: m.name,
          lat: m.lat,
          lon: m.lon,
          p50: m.p50,
          p10: m.p10,
          p90: m.p90,
          source: m.source,
          modelVersion: m.modelVersion,
          observedPm25: m.observedPm25,
          confidenceGrade: m.confidenceGrade,
        });
      } else {
        setSelectedPrediction(null);
      }
    };

    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const onMove = (e: PointerEvent) => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => { throttleTimer = null; }, CFG.HOVER_THROTTLE_MS);
      const m = findMarker(e);
      if (m) {
        setHoveredPrediction({
          name: m.name, lat: m.lat, lon: m.lon, p50: m.p50, p10: m.p10, p90: m.p90,
          confidenceGrade: m.confidenceGrade,
        });
      } else {
        setHoveredPrediction(null);
      }
    };

    canvas.addEventListener('pointerdown', onClick);
    canvas.addEventListener('pointermove', onMove);
    return () => {
      canvas.removeEventListener('pointerdown', onClick);
      canvas.removeEventListener('pointermove', onMove);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [gl, findMarker, setSelectedPrediction, setHoveredPrediction]);

  // Unmount (레이어 토글 off / 페이지 이탈): GPU 자원 + 유령 선택 정리.
  useEffect(() => {
    return () => {
      texture.dispose();
      geometry.dispose();
      setSelectedPrediction(null);
      setHoveredPrediction(null);
    };
  }, [texture, geometry, setSelectedPrediction, setHoveredPrediction]);

  if (markers.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, CFG.MAX_MARKERS]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        opacity={CFG.OPACITY}
        depthWrite={false}
        alphaTest={0.05}
        side={THREE.DoubleSide}
        vertexColors
      />
    </instancedMesh>
  );
};

export default PredictionMarkers;
