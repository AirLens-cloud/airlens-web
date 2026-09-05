/**
 * Globe3DScene — R3F Canvas wrapper for AirLens Globe V2.
 *
 * Clean dark globe with 3D data layers:
 * - Dark navy sphere + Fresnel atmosphere
 * - Coastline outlines + graticule grid
 * - Wind particles (speed-colored trails)
 * - Station spikes (PM2.5 3D bars)
 * - Data arcs (pollution transport)
 * - Alert pulses + station labels
 * - Star field background
 */
import { Suspense, lazy, useMemo, useState, useEffect, useCallback, useRef, createRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
// HDRLoader disabled — saves 5.3MB initial load
// import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { useShallow } from 'zustand/react/shallow';
import { useGlobeStore } from '../../../store/globeStore';
import { createFPSMonitor } from '../../../lib/adaptiveQuality';
import { GLOBE_CONFIG, STARFIELD_CONFIG } from '../../../lib/config/globe';
import { GLOBE_COLORS } from '../../../lib/config/globe-v2';
import { usePlatform } from '../../../hooks/usePlatform';
// EarthMesh disabled — coastline outlines provide sufficient geography
// import EarthMesh from './EarthMesh';
import Atmosphere from './Atmosphere';

const OceanSphere = lazy(() => import('./OceanSphere'));
const CountryClickHandler = lazy(() => import('./CountryClickHandler'));
const CameraController = lazy(() => import('./CameraController'));

const CountryExtrude = lazy(() => import('./layers/CountryExtrude'));
const WindParticles = lazy(() => import('./layers/WindParticles'));
const AlertPulse = lazy(() => import('./layers/AlertPulse'));
const StationLabels = lazy(() => import('./layers/StationLabels'));
const PredictionMarkers = lazy(() => import('./layers/PredictionMarkers'));
const CoastlineOutlines = lazy(() => import('./layers/CoastlineOutlines'));
const Graticule = lazy(() => import('./layers/Graticule'));
const ScalarFieldOverlay = lazy(() => import('./layers/ScalarFieldOverlay'));
const FireHotspots = lazy(() => import('./layers/FireHotspots'));
const SmokeEmitter = lazy(() => import('./layers/SmokeEmitter'));
const PollenParticles = lazy(() => import('./layers/PollenParticles'));
const CountryLabels = lazy(() => import('./layers/CountryLabels'));

const CAM = GLOBE_CONFIG.GLOBE_V2.CAMERA;
const LT = GLOBE_CONFIG.GLOBE_V2.LIGHTS;
const SF = STARFIELD_CONFIG;


// ── Twinkling starfield shader ───────────────────────────────────────

const starVertShader = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  varying float vTwinkle;
  uniform float uTime;
  void main() {
    vTwinkle = ${SF.BRIGHTNESS_FLOOR.toFixed(2)} + ${SF.TWINKLE_AMPLITUDE.toFixed(2)} * sin(uTime * ${SF.TWINKLE_SPEED.toFixed(1)} + aPhase);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / -mv.z) * vTwinkle;
    gl_Position = projectionMatrix * mv;
  }
`;

const starFragShader = /* glsl */ `
  varying float vTwinkle;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float a = smoothstep(0.5, 0.0, d) * vTwinkle;
    gl_FragColor = vec4(vec3(1.0), a * 0.9);
  }
`;

function generateStarField(count: number) {
  const pos = new Float32Array(count * 3);
  const ph = new Float32Array(count);
  const sz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = SF.INNER_RADIUS + Math.random() * (SF.OUTER_RADIUS - SF.INNER_RADIUS);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    ph[i] = Math.random() * Math.PI * 2;
    sz[i] = SF.SIZE_MIN + Math.random() * (SF.SIZE_MAX - SF.SIZE_MIN);
  }
  return { positions: pos, phases: ph, sizes: sz };
}

const StarField = ({ count = SF.COUNT }: { count?: number }) => {
  const starData = useMemo(() => generateStarField(count), [count]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  // eslint-disable-next-line react-hooks/immutability -- Three.js uniform mutation in R3F render loop
  useFrame(({ clock }) => { uniforms.uTime.value = clock.getElapsedTime(); });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[starData.positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[starData.phases, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[starData.sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={starVertShader}
        fragmentShader={starFragShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

// HdriEnvironment disabled — saves 5.3MB initial load.
// StarField + ambient/directional lights provide sufficient visuals.
// Re-enable via hdMode toggle if needed in the future.

/** Dark navy ocean sphere — legacy fallback */
// const DarkSphere = () => (
//   <mesh>
//     <sphereGeometry args={[1.0, 128, 96]} />
//     <meshBasicMaterial color={0x05080d} />
//   </mesh>
// );

/**
 * Loading fallback for the inner (data-layer) Suspense — a wireframe sphere
 * that spins slowly instead of sitting static, so the deck reads as "still
 * arriving" rather than "stuck" (01-ux-audit.md §2 #1 / 04-motion-system.md
 * loading scene: 3.2s/revolution). `usePlatform` is already the reduced-motion
 * source of truth for every other ambient motion in this file (autoRotate,
 * particle scale) — reused here rather than a second media-query listener.
 */
const LoadingFallback = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { prefersReducedMotion } = usePlatform();
  useFrame((_, delta) => {
    if (prefersReducedMotion || !meshRef.current) return;
    meshRef.current.rotation.y += (delta * Math.PI * 2) / 3.2;
  });
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1.0, 32, 32]} />
      <meshBasicMaterial color={GLOBE_COLORS.WIREFRAME_LOADING} wireframe opacity={0.2} transparent />
    </mesh>
  );
};

/** Module-level ref for OrbitControls — accessed by CameraController */
// eslint-disable-next-line react-refresh/only-export-components -- shared ref, not a component
export const orbitControlsRef = createRef<OrbitControlsImpl>();

/**
 * Defer heavy data-layer mount until after first paint (idle callback, 300ms
 * timeout fallback) so initial globe entry stays smooth.
 */
function useDeferredMount(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 300 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setReady(true), 120);
    return () => window.clearTimeout(id);
  }, []);
  return ready;
}

/** Renderless: samples FPS each frame and auto-adjusts the quality tier (downgrade/upgrade). */
const QualityGovernor = () => {
  const setQualityTier = useGlobeStore((s) => s.setQualityTier);
  const monitor = useMemo(
    () =>
      createFPSMonitor({
        initialTier: useGlobeStore.getState().qualityTier,
        onTierChange: setQualityTier,
        downgradeThreshold: 25,
        upgradeThreshold: 55,
      }),
    [setQualityTier],
  );
  useFrame(({ clock }) => monitor.tick(clock.elapsedTime * 1000));
  return null;
};

const Globe3DScene = ({ interactiveCountries = true }: { interactiveCountries?: boolean }) => {
  const [contextLost, setContextLost] = useState(false);
  const heavyReady = useDeferredMount();

  // a11y — the idle camera drift is decorative motion, so it obeys
  // prefers-reduced-motion like CameraController's fly-to tweens and
  // ScalarFieldOverlay's cross-fade already do. usePlatform subscribes to the
  // media query, so toggling the OS setting mid-session stops/resumes the drift
  // without a reload. Manual drag/zoom stay enabled — reduced motion means "no
  // motion I did not ask for", not "no interaction".
  const { prefersReducedMotion } = usePlatform();
  const particleMotionScale = prefersReducedMotion
    ? GLOBE_CONFIG.GLOBE_V2.PARTICLES.REDUCED_MOTION_SCALE
    : 1;

  // Wind particles run on the CPU path only in this repo — the GPU compute
  // variant (WindParticlesGPU + its renderer probe) is deferred with the rest
  // of G3, so there is no GPU/CPU arbitration here.

  // Pause the render loop while the tab is hidden (saves battery/heat → avoids
  // thermal-throttle jank). autoRotate resumes unchanged when visible again.
  const [frameloop, setFrameloop] = useState<'always' | 'never'>('always');
  useEffect(() => {
    const onVisibility = () => setFrameloop(document.hidden ? 'never' : 'always');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    const canvas = gl.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      setContextLost(true);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      setContextLost(false);
    });
  }, []);

  const {
    qualityPreset,
    showParticles,
    showStations,
    showGrid,
    showPollen,
    showFires,
    showPredictions,
    overlayType,
  } = useGlobeStore(useShallow((s) => ({
    qualityPreset: s.qualityPreset,
    showParticles: s.showParticles,
    showStations: s.showStations,
    showGrid: s.showGrid,
    showPollen: s.showPollen,
    showFires: s.showFires,
    showPredictions: s.showPredictions,
    overlayType: s.overlayType,
  })));
  const showOverlay = overlayType !== 'wind' && overlayType !== 'none';

  return (
    <>
    {contextLost && (
      <div className="gl-ctx-lost">
        <div className="gl-ctx-lost-inner">
          <p className="gl-ctx-lost-title">WebGL Context Lost</p>
          <p className="gl-ctx-lost-desc">The GPU context was lost. Please reload.</p>
          <button onClick={() => window.location.reload()} className="btn btn-ink">
            Reload
          </button>
        </div>
      </div>
    )}
    <Canvas
      role="img"
      aria-label="3D interactive globe visualization"
      frameloop={frameloop}
      onCreated={handleCreated}
      dpr={qualityPreset.dpr as [number, number]}
      camera={{
        fov: CAM.FOV,
        near: 0.01,
        far: 100,
        position: [...CAM.INITIAL_POSITION] as [number, number, number],
      }}
      gl={{
        antialias: qualityPreset.antialias,
        alpha: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      style={{ width: '100%', height: '100%' }}
    >
      {/* No <color attach="background"> — DottedSurface (Globe.tsx) renders the
          page background; the StarField mesh below preserves the cosmic cue. */}
      {/* HDR disabled — saves 5.3MB initial load. StarField + lights provide sufficient visuals */}
      {/* <HdriEnvironment /> */}

      <OrbitControls
        ref={orbitControlsRef as React.RefObject<OrbitControlsImpl>}
        minDistance={CAM.MIN_DISTANCE}
        maxDistance={CAM.MAX_DISTANCE}
        rotateSpeed={CAM.ROTATE_SPEED}
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minPolarAngle={CAM.MIN_POLAR_ANGLE}
        maxPolarAngle={CAM.MAX_POLAR_ANGLE}
        autoRotate={!prefersReducedMotion}
        autoRotateSpeed={0.3}
      />

      <QualityGovernor />

      <StarField count={qualityPreset.tier === 'low' ? 800 : 2000} />

      {/* 3-Light system for point cloud depth */}
      <ambientLight intensity={0.35} />
      <directionalLight
        color={LT.RIM.COLOR}
        intensity={LT.RIM.INTENSITY}
        position={[...LT.RIM.POSITION] as [number, number, number]}
      />
      <directionalLight
        color={LT.BACK.COLOR}
        intensity={LT.BACK.INTENSITY}
        position={[...LT.BACK.POSITION] as [number, number, number]}
      />

      <Suspense fallback={<LoadingFallback />}>
        {/* Base: unified earth surface (white land + animated ocean) + atmosphere */}
        <OceanSphere />
        <Atmosphere />

        {/* Geography */}
        <CoastlineOutlines />
        {showGrid && <Graticule />}
        {heavyReady && <CountryLabels />}

        {/* Data layers — deferred until after first paint for smoother entry */}
        {heavyReady && showPollen && <PollenParticles />}
        {heavyReady && showStations && <AlertPulse />}
        {heavyReady && showStations && <StationLabels />}
        {heavyReady && showPredictions && <PredictionMarkers />}
        {heavyReady && showOverlay && <ScalarFieldOverlay />}
        {heavyReady && showFires && <FireHotspots />}
        {heavyReady && showParticles && <WindParticles motionScale={particleMotionScale} />}
        {heavyReady && showFires && <SmokeEmitter />}

        {/* Country interaction */}
        {interactiveCountries && <CountryClickHandler />}
        {interactiveCountries && <CountryExtrude />}
        {interactiveCountries && <CameraController />}
      </Suspense>

      {/* Bloom postprocessing is deferred with G3 — @react-three/postprocessing
          is not a dependency of this repo, so the HD-mode EffectComposer block
          from the source scene is intentionally absent rather than stubbed. */}
    </Canvas>
    </>
  );
};

export default Globe3DScene;
