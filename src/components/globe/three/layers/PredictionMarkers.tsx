/**
 * PredictionMarkers — 자체 ML(AODtoPM25 v2) 도시 예측 마커.
 *
 * 관측소(StationLabels)와 의도적으로 다르게 보인다: 채운 관측소 아이콘 대신
 * p10–p90 밴드 스프라이트(`prediction-band-{narrow,mid,wide}`) — 예측을 실측처럼
 * 섞지 않기 위함(§5 Glass-box). 색은 p50 의 AQI 색 — 예측 농도는 색으로, "예측임"은
 * 밴드 형태로 이중 부호화. 불확실성은 이제 **두 채널**: 밴드 tier(형태, rel<0.35
 * narrow/<0.8 mid/그 외 wide — spriteKit.bandSprite)로 굵기가, 기존
 * `bandRelWidthToAlpha` 인스턴스 alpha 로 흐림 정도가 각각 부호화된다 — 배경·색약
 * 조건에서도 폭이 읽히도록 형태 채널을 알파 위에 추가(§교체 순서 1, 03-globe-
 * sprite-kit.md). 절차적 hollow-ring 캔버스 텍스처(createRingTexture)는 globe-kit
 * 자산으로 대체돼 제거 — 코드 밖에서 다듬을 수 없던 텍스처가 파일 자산이 됐다.
 *
 * tier마다 InstancedMesh가 분리된다(하나의 mesh는 텍스처 하나만 바인딩 가능하므로).
 * 등장은 04-motion-system.md의 R3F 감쇠 스프링(k=170, c=26, dt 기반 — 프레임 레이트
 * 독립)으로 scale 0→1, 40ms 스태거. 밴드는 3.2s 주기로 미세 호흡(scale ±6%).
 *
 * pointer 리스너는 관측소 레이어와 별개의 store 슬롯(hoveredPrediction /
 * selectedPrediction)에 쓴다 — 두 레이어가 서로의 null 을 덮어써 깜빡이는 경합을 피한다.
 */
import { useRef, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { usePredictionMarkers } from '../../../../hooks/useGlobeData';
import { useGlobeStore } from '../../../../store/globeStore';
import { usePlatform } from '../../../../hooks/usePlatform';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';
import { getAQIColor } from '../systems/geoUtils';
import { parsePredictionData, bandRelWidthToAlpha } from '../systems/predictionParse';
import { getSprite, bandSprite } from '../systems/spriteKit';
import { patchMaterialForInstanceAlpha, makeInstanceAlphaAttribute } from '../systems/instanceAlpha';
import type { PredictionMarker } from '../../../../types/globe';

const CFG = GLOBE_CONFIG.ML_PREDICTIONS;

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _dummy = new THREE.Object3D();

// R3F 마커 스프링 상수 (04-motion-system.md §"R3F 마커 스프링" — k=170/c=26 ≈ --ease-spring, dt 기반).
const SPRING_K = 170;
const SPRING_C = 26;
const STAGGER_MS = 40;
// 띠 호흡: scale = 1 + BREATH_AMPLITUDE * sin(t * 2π / BREATH_PERIOD_S).
const BREATH_AMPLITUDE = 0.06;
const BREATH_PERIOD_S = 3.2;

/** bandSprite()의 계약상 항상 이 3개 중 하나만 반환한다 (spriteKit.ts). */
type BandTier = 'prediction-band-narrow' | 'prediction-band-mid' | 'prediction-band-wide';

function groupByTier(markers: PredictionMarker[]): Record<BandTier, PredictionMarker[]> {
  const groups: Record<BandTier, PredictionMarker[]> = {
    'prediction-band-narrow': [],
    'prediction-band-mid': [],
    'prediction-band-wide': [],
  };
  for (const m of markers) {
    groups[bandSprite(m.p10, m.p50, m.p90) as BandTier].push(m);
  }
  return groups;
}

function zeroSpringMap(): Record<BandTier, Float32Array> {
  return {
    'prediction-band-narrow': new Float32Array(CFG.MAX_MARKERS),
    'prediction-band-mid': new Float32Array(CFG.MAX_MARKERS),
    'prediction-band-wide': new Float32Array(CFG.MAX_MARKERS),
  };
}

const PredictionMarkers = () => {
  const { camera, gl } = useThree();
  const { prefersReducedMotion } = usePlatform();
  const setSelectedPrediction = useGlobeStore((s) => s.setSelectedPrediction);
  const setHoveredPrediction = useGlobeStore((s) => s.setHoveredPrediction);
  const rawPredictions = usePredictionMarkers();

  const markers = useMemo(() => parsePredictionData(rawPredictions), [rawPredictions]);
  const groups = useMemo(() => groupByTier(markers), [markers]);

  const meshNarrowRef = useRef<THREE.InstancedMesh>(null);
  const meshMidRef = useRef<THREE.InstancedMesh>(null);
  const meshWideRef = useRef<THREE.InstancedMesh>(null);
  const materialNarrowRef = useRef<THREE.MeshBasicMaterial>(null);
  const materialMidRef = useRef<THREE.MeshBasicMaterial>(null);
  const materialWideRef = useRef<THREE.MeshBasicMaterial>(null);

  const textureNarrow = useMemo(() => getSprite('prediction-band-narrow'), []);
  const textureMid = useMemo(() => getSprite('prediction-band-mid'), []);
  const textureWide = useMemo(() => getSprite('prediction-band-wide'), []);

  const geometryNarrow = useMemo(() => {
    const geo = new THREE.PlaneGeometry(CFG.ICON_SIZE, CFG.ICON_SIZE);
    geo.setAttribute('instanceAlpha', makeInstanceAlphaAttribute(CFG.MAX_MARKERS));
    return geo;
  }, []);
  const geometryMid = useMemo(() => {
    const geo = new THREE.PlaneGeometry(CFG.ICON_SIZE, CFG.ICON_SIZE);
    geo.setAttribute('instanceAlpha', makeInstanceAlphaAttribute(CFG.MAX_MARKERS));
    return geo;
  }, []);
  const geometryWide = useMemo(() => {
    const geo = new THREE.PlaneGeometry(CFG.ICON_SIZE, CFG.ICON_SIZE);
    geo.setAttribute('instanceAlpha', makeInstanceAlphaAttribute(CFG.MAX_MARKERS));
    return geo;
  }, []);

  // Per-instance entrance-spring state (scale + velocity) — persists across renders,
  // mutated in place every useFrame tick, never drives a re-render.
  const springScale = useRef(zeroSpringMap());
  const springVel = useRef(zeroSpringMap());
  // Timestamp each tier's group was last (re)computed — the entrance stagger is
  // relative to this, so a data refresh replays the "appear" scene.
  const groupStartedAt = useRef<Record<BandTier, number>>({
    'prediction-band-narrow': 0, 'prediction-band-mid': 0, 'prediction-band-wide': 0,
  });

  // Deliberately NOT useMemo: react-hooks/immutability (eslint-plugin-react-hooks v7,
  // React Compiler-derived) flags any InstancedMesh mutation reached through a
  // memoized array's `.meshRef.current` as "mutating a memoized value" and does not
  // honor inline eslint-disable comments for that diagnostic. A plain per-render
  // array of stable refs sidesteps the false positive — recomputing three tiny
  // object literals every render is not a real cost.
  const tiers = [
    { tier: 'prediction-band-narrow' as const, markers: groups['prediction-band-narrow'], meshRef: meshNarrowRef, materialRef: materialNarrowRef, texture: textureNarrow, geometry: geometryNarrow },
    { tier: 'prediction-band-mid' as const, markers: groups['prediction-band-mid'], meshRef: meshMidRef, materialRef: materialMidRef, texture: textureMid, geometry: geometryMid },
    { tier: 'prediction-band-wide' as const, markers: groups['prediction-band-wide'], meshRef: meshWideRef, materialRef: materialWideRef, texture: textureWide, geometry: geometryWide },
  ];

  // Patch each tier's material once for per-instance alpha (band-width uncertainty channel).
  useEffect(() => {
    if (materialNarrowRef.current) patchMaterialForInstanceAlpha(materialNarrowRef.current);
    if (materialMidRef.current) patchMaterialForInstanceAlpha(materialMidRef.current);
    if (materialWideRef.current) patchMaterialForInstanceAlpha(materialWideRef.current);
  }, []);

  // Initialize instance matrices + AQI colors from p50 + alpha from band width, per tier.
  // Also (re)seeds the entrance-spring state, so a data refresh replays the appear scene.
  /* eslint-disable react-hooks/immutability -- imperative Three.js InstancedMesh mutation (R3F escape hatch), same intent as Atmosphere.tsx's uniform mutation; the compiler-derived rule reports at the hook call itself so the whole statement is wrapped, not just the inner body */
  useEffect(() => {
    const now = performance.now();
    for (const g of tiers) {
      const mesh = g.meshRef.current;
      if (!mesh) continue;
      const count = Math.min(g.markers.length, CFG.MAX_MARKERS);
      mesh.count = count;
      groupStartedAt.current[g.tier] = now;

      const scaleArr = springScale.current[g.tier];
      const velArr = springVel.current[g.tier];
      const alphaAttr = mesh.geometry.getAttribute('instanceAlpha') as THREE.InstancedBufferAttribute;

      for (let i = 0; i < count; i++) {
        const m = g.markers[i];
        _dummy.position.copy(m.position);
        _dummy.scale.setScalar(prefersReducedMotion ? 1 : 0);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
        mesh.setColorAt(i, getAQIColor(m.p50));
        alphaAttr.setX(i, bandRelWidthToAlpha(m.p10, m.p50, m.p90));
        scaleArr[i] = prefersReducedMotion ? 1 : 0;
        velArr[i] = 0;
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      alphaAttr.needsUpdate = true;
    }
    // `tiers` itself is rebuilt every render from `groups` + stable refs — depend on
    // `groups` (the actually-changing input) so this doesn't re-run on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, prefersReducedMotion]);
  /* eslint-enable react-hooks/immutability */

  // Billboard toward camera + entrance spring + band-breathing (skipped for
  // reduced motion: scale pinned to 1, same pattern as Globe3DScene's autoRotate gate).
  /* eslint-disable react-hooks/immutability -- imperative Three.js InstancedMesh mutation in the R3F render loop (see note on the init effect above) */
  useFrame((_, dt) => {
    const camPos = camera.position;
    const now = performance.now();
    const breath = prefersReducedMotion
      ? 1
      : 1 + BREATH_AMPLITUDE * Math.sin((now / 1000) * (2 * Math.PI / BREATH_PERIOD_S));
    // stale 여부로 호흡을 멈추는 게이트: PredictionMarker/CityPrediction 에 신선도
    // 필드가 없다 — api/predictions.ts의 fetchCityPredictionsResult()는 generatedAt을
    // 돌려주지만 useGlobeData.usePredictionMarkers()가 이를 버리고 배열만 노출한다.
    // TODO(stale-gate): 훅이 generatedAt을 노출하게 되면 `breath`를 stale 스냅샷에서
    // 1로(정지) 고정한다 — 지금은 항상 호흡한다.

    for (const g of tiers) {
      const mesh = g.meshRef.current;
      if (!mesh || g.markers.length === 0) continue;
      const count = Math.min(g.markers.length, CFG.MAX_MARKERS);
      const scaleArr = springScale.current[g.tier];
      const velArr = springVel.current[g.tier];
      const startedAt = groupStartedAt.current[g.tier];

      for (let i = 0; i < count; i++) {
        let scale: number;
        if (prefersReducedMotion) {
          scale = 1;
        } else {
          const target = now - startedAt - i * STAGGER_MS >= 0 ? 1 : 0;
          const a = -SPRING_K * (scaleArr[i] - target) - SPRING_C * velArr[i];
          velArr[i] += a * dt;
          scaleArr[i] += velArr[i] * dt;
          scale = scaleArr[i];
        }

        const m = g.markers[i];
        _dummy.position.copy(m.position);
        _dummy.lookAt(camPos);
        _dummy.scale.setScalar(scale * breath);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });
  /* eslint-enable react-hooks/immutability */

  const findMarker = useCallback((event: PointerEvent): PredictionMarker | null => {
    const meshes = tiers.map((g) => g.meshRef.current).filter((m): m is THREE.InstancedMesh => !!m);
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
    const group = tiers.find((g) => g.meshRef.current === hit.object);
    return group?.markers[instanceId] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tiers` rebuilt from `groups` + stable refs, see note above
  }, [camera, gl, groups]);

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

  // Unmount (레이어 토글 off / 페이지 이탈): geometry 는 로컬 소유라 dispose, 스프라이트
  // 텍스처는 spriteKit의 공유 캐시 소유라 여기서 dispose하지 않는다(다른 마운트가 재사용).
  useEffect(() => {
    return () => {
      geometryNarrow.dispose();
      geometryMid.dispose();
      geometryWide.dispose();
      setSelectedPrediction(null);
      setHoveredPrediction(null);
    };
  }, [geometryNarrow, geometryMid, geometryWide, setSelectedPrediction, setHoveredPrediction]);

  if (markers.length === 0) return null;

  return (
    <>
      <instancedMesh ref={meshNarrowRef} args={[geometryNarrow, undefined, CFG.MAX_MARKERS]} frustumCulled={false}>
        <meshBasicMaterial
          ref={materialNarrowRef}
          map={textureNarrow}
          transparent
          opacity={CFG.OPACITY}
          depthWrite={false}
          alphaTest={0.05}
          side={THREE.DoubleSide}
          vertexColors
        />
      </instancedMesh>
      <instancedMesh ref={meshMidRef} args={[geometryMid, undefined, CFG.MAX_MARKERS]} frustumCulled={false}>
        <meshBasicMaterial
          ref={materialMidRef}
          map={textureMid}
          transparent
          opacity={CFG.OPACITY}
          depthWrite={false}
          alphaTest={0.05}
          side={THREE.DoubleSide}
          vertexColors
        />
      </instancedMesh>
      <instancedMesh ref={meshWideRef} args={[geometryWide, undefined, CFG.MAX_MARKERS]} frustumCulled={false}>
        <meshBasicMaterial
          ref={materialWideRef}
          map={textureWide}
          transparent
          opacity={CFG.OPACITY}
          depthWrite={false}
          alphaTest={0.05}
          side={THREE.DoubleSide}
          vertexColors
        />
      </instancedMesh>
    </>
  );
};

export default PredictionMarkers;
