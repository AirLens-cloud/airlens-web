/**
 * FireHotspots — NASA FIRMS active fire visualization on the globe.
 *
 * Two camera-facing sprite layers per hotspot (globe-kit): a soft radial glow
 * (`ember.png`, additive, toneMapped:false) so fires read as burning light on
 * the dark night-side earth rather than flat dots, plus a smaller flame
 * silhouette (`fire-flame.png`, normal blend) as a solid core on top — the
 * same core+glow composite the sprite generator authored the two assets for
 * (see docs/design-reports/2026-09-05-design-audit/globe-kit/gen_globe_kit.py
 * comment "fire hotspot core — flame silhouette (soft ember added below)").
 * FRP drives size + brightness, and a subtle per-instance flicker gives the
 * field an ember-like life. Color tints from deep ember (low FRP) → white-hot
 * (high FRP).
 *
 * 데이터 경로는 발행 피드 1단이다 — 구 레포의 `firms-proxy` 온디맨드 보강 tier 는
 * Supabase 인증 경로라 이 레포에 없다. 대신 낡음을 그대로 드러낸다: 낡음 판정은
 * `fireCoverage.stale` 이 소유하고, HUD 배지가 읽는 값과 같은 판정이다.
 */
import { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { fetchFireFeed } from '../../../../api/fires';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';
import { buildFireCoverage } from '../../../../lib/globe/fireCoverage';
import { useGlobeStore } from '../../../../store/globeStore';
import { getSprite } from '../systems/spriteKit';
import type { FireHotspot } from '../../../../types/globe';

const CFG = GLOBE_CONFIG.FIRE_HOTSPOTS;

const DEG2RAD = Math.PI / 180;

// 실루엣 core 는 glow 보다 작게(스프라이트 자체가 코어까지 채운 형태라 과대 스케일이면
// 뭉개진다). 완전 불투명에 가까운 alphaTest 컷 — glow 위에 얹히는 solid 층이라 additive
// 가 아니라 일반 블렌딩.
const FLAME_SCALE = 0.55;
const FLAME_OPACITY = 0.92;

const colorLow = new THREE.Color(CFG.COLOR_LOW);
const colorHigh = new THREE.Color(CFG.COLOR_HIGH);

function latLonToPosition(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

const dummy = new THREE.Object3D();
const _color = new THREE.Color();
const MAX_FIRES = 5000;

const FireHotspots = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const flameMeshRef = useRef<THREE.InstancedMesh>(null);
  const firesRef = useRef<FireHotspot[]>([]);
  const countRef = useRef(0);
  const { camera } = useThree();
  const setFireCoverage = useGlobeStore((s) => s.setFireCoverage);

  // globe-kit 사양(§교체 순서 4): createEmberTexture() 절차 생성 → ember.png (glow) +
  // fire-flame.png (silhouette core). 둘 다 spriteKit 의 공유 캐시 소유 — 여기서 dispose 안 함.
  const emberTexture = useMemo(() => getSprite('ember'), []);
  const flameTexture = useMemo(() => getSprite('fire-flame'), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  // Load fire data + set static color (FRP tint) once.
  useEffect(() => {
    let cancelled = false;

    /** 한 피드를 인스턴스 메시에 반영하고 커버리지를 게시한다. */
    const apply = (fires: FireHotspot[], raw: unknown): void => {
      const mesh = meshRef.current;
      if (!mesh) return;

      firesRef.current = fires;
      countRef.current = Math.min(fires.length, mesh.count);

      // 3단 절단(탐지 → 발행 → 렌더)을 HUD 가 읽을 수 있게 게시한다.
      // MAX_FIRES 상한 때문에 렌더 수는 발행 수보다 작을 수 있다.
      const coverage = buildFireCoverage(raw, countRef.current, Date.now());
      setFireCoverage(coverage);

      const flameMesh = flameMeshRef.current;
      for (let i = 0; i < countRef.current; i++) {
        const fire = fires[i];
        const frpNorm = Math.min((fire.frp ?? 10) / CFG.FRP_MAX, 1);
        _color.copy(colorLow).lerp(colorHigh, frpNorm);
        mesh.setColorAt(i, _color);
        flameMesh?.setColorAt(i, _color);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (flameMesh?.instanceColor) flameMesh.instanceColor.needsUpdate = true;
      mesh.count = countRef.current;
      if (flameMesh) flameMesh.count = countRef.current;
    };

    // 피드를 못 가져오면 커버리지를 게시하지 않는다 — null 커버리지는 "불이 없다"
    // 가 아니라 "모른다" 이고, HUD 는 그 둘을 다르게 그려야 한다.
    fetchFireFeed().then((feed) => {
      if (cancelled || !meshRef.current || !feed) return;
      apply(feed.fires, feed.raw);
    });

    // 레이어가 꺼지면 커버리지도 지운다 — 사라진 레이어의 숫자가 HUD 에 남으면
    // 지금 보이는 것을 서술하지 않는 문장이 된다.
    return () => { cancelled = true; setFireCoverage(null); };
  }, [setFireCoverage]);

  // Billboard + FRP-scaled size + subtle per-instance flicker (glow + flame core, in lockstep).
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || countRef.current === 0) return;
    const flameMesh = flameMeshRef.current;

    const t = clock.getElapsedTime();
    const fires = firesRef.current;
    const camPos = camera.position;

    for (let i = 0; i < countRef.current; i++) {
      const fire = fires[i];
      const pos = latLonToPosition(fire.lat, fire.lon, CFG.GLOBE_R);
      const frpNorm = Math.min((fire.frp ?? 10) / CFG.FRP_MAX, 1);
      const baseScale = CFG.MIN_SIZE + frpNorm * (CFG.MAX_SIZE - CFG.MIN_SIZE);

      // Staggered flicker per hotspot (ember life)
      const phase = (fire.lat + fire.lon) * 0.1;
      const flicker = 1 + CFG.PULSE_AMPLITUDE * Math.sin(t * CFG.PULSE_SPEED + phase);

      dummy.position.copy(pos);
      dummy.scale.setScalar(baseScale * flicker);
      dummy.lookAt(camPos);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      if (flameMesh) {
        dummy.scale.setScalar(baseScale * flicker * FLAME_SCALE);
        dummy.updateMatrix();
        flameMesh.setMatrixAt(i, dummy.matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (flameMesh) flameMesh.instanceMatrix.needsUpdate = true;
  });

  // Sprite textures come from spriteKit's shared cache — only the locally-owned
  // (shared, single) geometry is disposed here.
  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[geometry, undefined, MAX_FIRES]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          map={emberTexture}
          transparent
          opacity={CFG.OPACITY}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          side={THREE.DoubleSide}
          vertexColors
        />
      </instancedMesh>
      <instancedMesh
        ref={flameMeshRef}
        args={[geometry, undefined, MAX_FIRES]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          map={flameTexture}
          transparent
          opacity={FLAME_OPACITY}
          depthWrite={false}
          alphaTest={0.1}
          side={THREE.DoubleSide}
          vertexColors
        />
      </instancedMesh>
    </>
  );
};

export default FireHotspots;
