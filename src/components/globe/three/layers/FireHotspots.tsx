/**
 * FireHotspots — NASA FIRMS active fire visualization on the globe.
 *
 * Renders each hotspot as a camera-facing radial-glow sprite (additive,
 * toneMapped:false) so fires read as burning light on the dark night-side
 * earth rather than flat dots. FRP drives size + brightness, and a subtle
 * per-instance flicker gives the field an ember-like life. Color tints from
 * deep ember (low FRP) → white-hot (high FRP); the sprite texture supplies
 * the soft core→edge falloff.
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
import type { FireHotspot } from '../../../../types/globe';

const CFG = GLOBE_CONFIG.FIRE_HOTSPOTS;

const DEG2RAD = Math.PI / 180;

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

/** Soft radial glow texture (core → mid → transparent edge) for ember sprites. */
function createEmberTexture(): THREE.CanvasTexture {
  const size = CFG.TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, CFG.CORE_COLOR);
  grad.addColorStop(0.35, CFG.MID_COLOR);
  grad.addColorStop(0.7, CFG.EDGE_COLOR);
  grad.addColorStop(1, 'rgba(255, 90, 31, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const dummy = new THREE.Object3D();
const _color = new THREE.Color();
const MAX_FIRES = 5000;

const FireHotspots = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const firesRef = useRef<FireHotspot[]>([]);
  const countRef = useRef(0);
  const { camera } = useThree();
  const setFireCoverage = useGlobeStore((s) => s.setFireCoverage);

  const texture = useMemo(() => createEmberTexture(), []);
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

      for (let i = 0; i < countRef.current; i++) {
        const fire = fires[i];
        const frpNorm = Math.min((fire.frp ?? 10) / CFG.FRP_MAX, 1);
        _color.copy(colorLow).lerp(colorHigh, frpNorm);
        mesh.setColorAt(i, _color);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.count = countRef.current;
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

  // Billboard + FRP-scaled size + subtle per-instance flicker.
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || countRef.current === 0) return;

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
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  useEffect(() => {
    return () => {
      texture.dispose();
      geometry.dispose();
    };
  }, [texture, geometry]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, MAX_FIRES]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={CFG.OPACITY}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        side={THREE.DoubleSide}
        vertexColors
      />
    </instancedMesh>
  );
};

export default FireHotspots;
