/**
 * ScalarFieldOverlay — generalized scalar field heatmap on the 3D globe.
 *
 * Supports PM2.5, PM10, Temp, RH, NO₂, O₃, CO, SST, SSTA, Currents overlays.
 * Renders an offscreen equirectangular IDW texture on a transparent sphere.
 * Color scale per overlay type from earth/config.ts.
 * Resolution adapts to quality tier (high=1024x512, medium=512x256).
 *
 * ── P8b timeline cross-fade (V-W3) ──────────────────────────────────────────
 * Glass-box boundary (do not change without re-reading this note): the GEFS
 * timeline is a single deterministic member — there is no ensemble to draw a
 * confidence interval from, and there is no "value between two frames" to
 * compute. The boundary is about *data*, not pixels: no stored, sampled, or
 * displayed DATA value (grid cells, HUD meta, hover readouts) is ever
 * interpolated between frame A and frame B. The transition itself is a
 * dual-texture cross-DISSOLVE — both real frames' textures stay bound and the
 * fragment shader outputs `mix(realFrameA, realFrameB, uBlend)` over
 * TIMELINE_CROSSFADE_MS. That mix does linearly blend RGB on screen for
 * ~280ms (mathematically the standard alpha-composite dissolve), so transient
 * blended *colors* exist — presentation only, never fed back into any
 * readout. Authoritative readouts follow one rule: the HUD timestamp
 * (GlobeObsHud, via activeGridMeta) snaps to frame B exactly at blend===0.5
 * (crossfade.ts `resolveDisplayedFrame`), and the grid-cell hover readout is
 * suppressed for the pre-midpoint half (cache already holds frame B while the
 * screen is still frame-A-dominant) so "what you're looking at" always has
 * one answer, never a "40% valid at 14:00 / 60% valid at 17:00" reading.
 *
 * Memory: both textures are already owned by scalarField.ts's 30-min TTL cache
 * (any distinct frame the user has visited recently is already resident there
 * regardless of this component). A cross-fade at most holds 2 references into
 * that existing cache concurrently — it does not allocate new GPU memory beyond
 * one extra bound texture unit for ~280ms (360×180 RGBA8 ≈ 253KB per frame).
 * `prefers-reduced-motion` skips the tween entirely (hard swap, no dual bind).
 */
import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGlobeMarkers } from '../../../../hooks/useGlobeData';
import { useGlobeStore } from '../../../../store/globeStore';
import type { ActiveGridMeta } from '../../../../store/globeStore';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';
import { aqiToPm25 } from '../../../../lib/config/aqi';
import { OVERLAY_SCALE_MAP, GRID_RENDERABLE_OVERLAYS, TIMELINE_ENABLED } from '../../../../lib/config/globeOverlays';
import { resolveFrame } from '../../../../api/timeline';
import type { OverlayType } from '../../../../types/globe';
import type { IdwStationPt } from '../../../../types/globe';
import { getScalarFieldTexture, disposeScalarFieldTextures, getScalarFieldMeta, sampleGridAt } from '../systems/scalarField';
import { computeIdwField, disposeIdwWorker } from '../systems/idwClient';
import { vec3ToLatLon } from '../systems/geoUtils';
import { computeBlend, isBlendMidpoint } from '../systems/crossfade';

const HEATMAP_SPHERE_R = 1.005;
const IDW_POWER = 2.0;
const MAX_DIST_DEG = 15;
const CROSSFADE_MS = GLOBE_CONFIG.GLOBE_HEATMAP.TIMELINE_CROSSFADE_MS;

// Grid cell hover readout — module-scope reuse (no per-event allocation).
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

/** 1×1 fully-transparent texture — bound to uTexA/uTexB before the first real
 *  frame loads (uOpacity starts at 0, so it never actually paints anything).
 *  A shared module singleton (never disposed) — same lifecycle discipline as
 *  the WIND_SPEED_RAMP-style module constants elsewhere in this tree. */
const PLACEHOLDER_TEXTURE = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
PLACEHOLDER_TEXTURE.needsUpdate = true;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const crossfadeVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Always mixes two bound textures — when not cross-fading, uTexB === uTexA and
 *  uBlend === 0, so `mix(a, b, 0)` is exactly `a`. No branch, no null uniform. */
const crossfadeFragmentShader = /* glsl */ `
  uniform sampler2D uTexA;
  uniform sampler2D uTexB;
  uniform float uBlend;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 a = texture2D(uTexA, vUv);
    vec4 b = texture2D(uTexB, vUv);
    vec4 c = mix(a, b, uBlend);
    gl_FragColor = vec4(c.rgb, c.a * uOpacity);
  }
`;

/** Overlays that use station-based IDW (fallback when grid data unavailable) */
const STATION_BASED: Set<OverlayType> = new Set(['pm25', 'pm10']);

/** Overlays that can use grid data (AQ, weather, marine) — scale map SOT 와 동일 집합 */
const GRID_BASED: Set<OverlayType> = new Set(GRID_RENDERABLE_OVERLAYS);

function parseStationPts(raw: unknown[]): IdwStationPt[] {
  const CLAMP = GLOBE_CONFIG.AQ_SPIKES.PM25_CLAMP_MAX;
  const results: IdwStationPt[] = [];
  for (const item of raw) {
    const m = item as Record<string, unknown>;
    const loc = m.location as { lat?: number; lon?: number } | undefined;
    if (!loc?.lat || !loc?.lon) continue;
    const aqi = typeof m.aqi === 'number' ? m.aqi : 0;
    if (aqi <= 0) continue;
    results.push({
      lat: loc.lat,
      lon: loc.lon,
      value: Math.min(aqiToPm25(aqi), CLAMP),
    });
  }
  return results;
}

const ScalarFieldOverlay = () => {
  const rawMarkers = useGlobeMarkers();
  const markersRef = useRef<unknown[]>([]);
  useEffect(() => { markersRef.current = rawMarkers; }, [rawMarkers]);
  const overlayType = useGlobeStore((s) => s.overlayType);
  const qualityPreset = useGlobeStore((s) => s.qualityPreset);
  const setActiveGridMeta = useGlobeStore((s) => s.setActiveGridMeta);
  const setGridHover = useGlobeStore((s) => s.setGridHover);
  const timeOffsetHours = useGlobeStore((s) => s.timeOffsetHours);
  const timelineFrames = useGlobeStore((s) => s.timelineFrames);
  const { camera, gl } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const prevOverlay = useRef(overlayType);
  // 타임라인 프레임이 바뀔 때(같은 오버레이) 어느 프레임을 크로스페이드할지 판별하는 키.
  // Initial 'live' is deliberate: a deep-link first load with offset≠0 takes the
  // cross-fade branch, but texA is still the 1×1 transparent placeholder, so it
  // renders as a plain fade-in — not a frame-to-frame blend.
  const prevFrameKey = useRef<string>('live');

  // ── P8b cross-fade state (see file header) — refs, not React state: mutated
  // every useFrame tick and by the async loadData effect, never drives a re-render.
  const texARef = useRef<THREE.Texture>(PLACEHOLDER_TEXTURE);
  const texBRef = useRef<THREE.Texture | null>(null);
  const blendActiveRef = useRef(false);
  const blendStartRef = useRef(0);
  const blendCommittedRef = useRef(true);
  const pendingMetaRef = useRef<ActiveGridMeta | null>(null);

  const uniforms = useMemo(
    () => ({
      uTexA: { value: PLACEHOLDER_TEXTURE as THREE.Texture },
      uTexB: { value: PLACEHOLDER_TEXTURE as THREE.Texture },
      uBlend: { value: 0 },
      uOpacity: { value: 0 },
    }),
    [],
  );

  /** Hard-sets both texture slots to the same texture — no cross-fade (overlay-type
   *  switch, IDW fallback, reduced-motion, or first load). Cancels any in-flight blend. */
  const snapTexture = useCallback(
    (tex: THREE.Texture) => {
      texARef.current = tex;
      texBRef.current = null;
      blendActiveRef.current = false;
      blendCommittedRef.current = true;
      if (materialRef.current) {
        materialRef.current.uniforms.uTexA.value = tex;
        materialRef.current.uniforms.uTexB.value = tex;
        materialRef.current.uniforms.uBlend.value = 0;
      }
    },
    [],
  );

  const texW = qualityPreset.tier === 'high' ? 1024 : 512;
  const texH = qualityPreset.tier === 'high' ? 512 : 256;

  const colorScale = useMemo(() => OVERLAY_SCALE_MAP[overlayType], [overlayType]);
  const hasValidScale = !!colorScale && (STATION_BASED.has(overlayType) || GRID_BASED.has(overlayType));

  // Create offscreen canvas
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = texW;
    canvas.height = texH;
    canvasRef.current = canvas;
  }, [texW, texH]);

  // Fetch data and build heatmap when overlay changes
  useEffect(() => {
    if (!hasValidScale || !colorScale) return;

    let cancelled = false;

    const loadData = async () => {
      // 1. Try AQ grid texture (preferred — higher resolution, global coverage)
      if (GRID_BASED.has(overlayType)) {
        // P8b — timeline is PM2.5-only; offset≠0 pulls a pre-collected GEFS frame,
        // offset 0 keeps the live current-* path. resolveFrame → null falls through.
        const frame =
          TIMELINE_ENABLED && timeOffsetHours !== 0 && timelineFrames && overlayType === 'pm25'
            ? resolveFrame(timelineFrames, timeOffsetHours)
            : null;
        const gridTex = frame
          ? await getScalarFieldTexture('pm25', {
              file: frame.file,
              validTimeMs: Date.parse(frame.validTime),
              leadHours: frame.leadHours,
            })
          : await getScalarFieldTexture(overlayType);
        if (!cancelled && gridTex) {
          textureRef.current?.dispose();
          textureRef.current = null;

          const meta = getScalarFieldMeta(overlayType);
          const nextMeta: ActiveGridMeta | null = meta
            ? {
                overlayType,
                source: meta.source,
                timestamp: meta.timestamp,
                min: meta.min,
                max: meta.max,
                leadHours: meta.leadHours,
                validTime: meta.validTime,
                cycle: frame?.cycle,
              }
            : null;

          const overlaySwitched = prevOverlay.current !== overlayType;
          const frameKey = frame?.file ?? 'live';
          const frameChanged = frameKey !== prevFrameKey.current;

          if (overlaySwitched) {
            // Overlay-type switch — existing hard-reset-then-refade mechanic
            // (the opacity ramp below), unrelated to the timeline cross-fade.
            snapTexture(gridTex);
            if (meshRef.current) meshRef.current.userData.opacity = 0;
            prevOverlay.current = overlayType;
            prevFrameKey.current = frameKey;
            if (nextMeta) setActiveGridMeta(nextMeta);
          } else if (frameChanged) {
            // Same overlay, timeline frame changed — cross-fade frame A → frame B.
            if (prefersReducedMotion()) {
              // No fabricated in-between visual state for reduced-motion users —
              // snap straight to the new frame.
              snapTexture(gridTex);
              if (nextMeta) setActiveGridMeta(nextMeta);
            } else {
              texBRef.current = gridTex;
              pendingMetaRef.current = nextMeta;
              blendStartRef.current = performance.now();
              blendActiveRef.current = true;
              blendCommittedRef.current = false;
              if (materialRef.current) {
                materialRef.current.uniforms.uTexB.value = gridTex;
                materialRef.current.uniforms.uBlend.value = 0;
              }
            }
            prevFrameKey.current = frameKey;
          } else if (!blendActiveRef.current) {
            // Same overlay + same frame (e.g. cache refresh) — no cross-fade needed.
            snapTexture(gridTex);
            if (nextMeta) setActiveGridMeta(nextMeta);
          }

          setReady(true);
          return;
        }
      }

      // 2. Fallback: station-based IDW (for pm25/pm10 when grid unavailable)
      if (!STATION_BASED.has(overlayType)) return;

      const raw = markersRef.current;
      if (cancelled || raw.length === 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const stations = parseStationPts(raw);
      if (stations.length === 0) return;

      const ctx = canvas.getContext('2d')!;
      const pixels = await computeIdwField(stations, colorScale, texW, texH, {
        power: IDW_POWER,
        maxDistDeg: MAX_DIST_DEG,
        alphaMax: GLOBE_CONFIG.GLOBE_HEATMAP.ALPHA_MAX,
        alphaBase: GLOBE_CONFIG.GLOBE_HEATMAP.ALPHA_BASE,
        alphaDivisor: GLOBE_CONFIG.GLOBE_HEATMAP.ALPHA_PM25_DIVISOR,
        densityFullDeg: GLOBE_CONFIG.GLOBE_HEATMAP.DENSITY_FULL_DEG,
        densityFadeDeg: GLOBE_CONFIG.GLOBE_HEATMAP.DENSITY_FADE_DEG,
        densityAlphaMin: GLOBE_CONFIG.GLOBE_HEATMAP.DENSITY_ALPHA_MIN,
      });
      if (cancelled) return; // 세대 폐기 — stale 결과 미적용
      ctx.putImageData(new ImageData(pixels, texW, texH), 0, 0);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      textureRef.current?.dispose();
      textureRef.current = texture;

      // IDW fallback is never part of the timeline cross-fade (P8b is PM2.5-grid
      // only) — always a hard snap, and clears any in-flight grid-frame blend.
      snapTexture(texture);
      prevFrameKey.current = 'live';

      if (prevOverlay.current !== overlayType) {
        if (meshRef.current) meshRef.current.userData.opacity = 0;
        prevOverlay.current = overlayType;
      }

      // GlobeLegend branches on this exact source string to show the IDW caveat —
      // hence the shared constant rather than a literal on each side.
      setActiveGridMeta({ overlayType, source: GLOBE_CONFIG.GLOBE_HEATMAP.IDW_SOURCE_LABEL, timestamp: Date.now(), min: NaN, max: NaN });
      setReady(true);
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [overlayType, hasValidScale, colorScale, texW, texH, setActiveGridMeta, timeOffsetHours, timelineFrames, snapTexture]);

  // Clear dashboard meta when no overlay is active.
  useEffect(() => {
    if (overlayType === 'none') setActiveGridMeta(null);
  }, [overlayType, setActiveGridMeta]);

  // Grid cell hover readout — throttled raycast → store.gridHover (DOM GlobeTooltip 소비)
  useEffect(() => {
    const canvas = gl.domElement;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const onMove = (e: PointerEvent) => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => { throttleTimer = null; }, 50);
      const mesh = meshRef.current;
      if (!mesh) return;
      const rect = canvas.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObject(mesh, false);
      if (hits.length === 0) { setGridHover(null); return; }
      const { lat, lon } = vec3ToLatLon(hits[0].point);
      // Cross-fade honesty (file header): before the blend midpoint the screen
      // is still frame-A-dominant but gridCache already holds frame B — showing
      // B's numbers over A's colors would break the one-answer rule. Suppress
      // the readout for that pre-midpoint half (~140ms); after the midpoint the
      // cache and the committed HUD frame agree again.
      if (blendActiveRef.current && !blendCommittedRef.current) {
        setGridHover(null);
        return;
      }
      setGridHover({ lat, lon, value: sampleGridAt(overlayType, lat, lon) });
    };
    const onLeave = () => setGridHover(null);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      if (throttleTimer) clearTimeout(throttleTimer);
      setGridHover(null);
    };
  }, [gl, camera, overlayType, setGridHover]);

  // Cleanup textures on unmount
  useEffect(() => {
    return () => {
      textureRef.current?.dispose();
      disposeScalarFieldTextures();
      disposeIdwWorker();
    };
  }, []);

  // Fade-in/out animation — use mesh.userData to avoid hooks/immutability lint error
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;
    const cur = (mesh.userData.opacity as number) ?? 0;

    if (ready && hasValidScale) {
      const next = Math.min(cur + delta * 0.8, 0.85);
      mesh.userData.opacity = next;
      material.uniforms.uOpacity.value = next;
    } else if (cur > 0.01) {
      const next = Math.max(cur - delta * 1.5, 0);
      mesh.userData.opacity = next;
      material.uniforms.uOpacity.value = next;
    }

    // ── P8b cross-fade tick (see file header) ──
    if (blendActiveRef.current) {
      const elapsed = performance.now() - blendStartRef.current;
      const blend = computeBlend(elapsed, CROSSFADE_MS);
      material.uniforms.uBlend.value = blend;

      // HUD timestamp snap — commit the incoming frame's meta exactly once, at
      // the visual halfway point (crossfade.ts resolveDisplayedFrame's rule).
      if (!blendCommittedRef.current && isBlendMidpoint(blend)) {
        blendCommittedRef.current = true;
        if (pendingMetaRef.current) setActiveGridMeta(pendingMetaRef.current);
      }

      if (blend >= 1) {
        const finished = texBRef.current ?? texARef.current;
        texARef.current = finished;
        texBRef.current = null;
        material.uniforms.uTexA.value = finished;
        material.uniforms.uTexB.value = finished;
        material.uniforms.uBlend.value = 0;
        blendActiveRef.current = false;
      }
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[HEATMAP_SPHERE_R, 64, 32]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={crossfadeVertexShader}
        fragmentShader={crossfadeFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
        blending={THREE.NormalBlending}
        toneMapped={false}
      />
    </mesh>
  );
};

export default ScalarFieldOverlay;
