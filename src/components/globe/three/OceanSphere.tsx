/**
 * OceanSphere — unified earth: bright white land + sky blue ocean.
 *
 * Land: custom shader with proper RGB mask sampling, flat sphere (no
 *       vertex displacement) with a 5-stage altitude color ramp from the
 *       bump map, day/night terminator dimming + NASA Black Marble city
 *       lights (HD mode).
 * Ocean: shader-lit sky blue, terminator-matched with land so lighting
 *        reads as one consistent globe (no meshStandardMaterial —
 *        avoids scene-light dependency divorced from uSunDirection).
 */
import { useMemo, useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { OCEAN_SPHERE_CONFIG, DOT_MATRIX_CONFIG } from '../../../lib/config/globe';
import { logger } from '../../../lib/logger';
import { GLOBE_COLORS } from '../../../lib/config/globe-v2';
import { useGlobeStore } from '../../../store/globeStore';
import { getSunDirection } from '../utils/sun';

const OS = OCEAN_SPHERE_CONFIG;
const DM = DOT_MATRIX_CONFIG;
const texLoader = new THREE.TextureLoader();

/** Sun direction refreshes ~once/sec — real-world position, no need for per-frame recompute. */
const SUN_REFRESH_FRAMES = 60;

/** 1x1 black fallback — prevents GPU undefined behavior on null sampler2D before night texture loads. */
const fallbackNightTex = (() => {
  const data = new Uint8Array([0, 0, 0, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
})();

// ── Land shader ─────────────────────────────────────────────────────

const landVert = /* glsl */ `
  uniform sampler2D uBumpMap;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying float vElevation;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

    // Bump sample kept for fragment-stage altitude color ramp — no displacement,
    // vertices stay on the sphere.
    vElevation = texture2D(uBumpMap, uv).r;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;

    gl_Position = projectionMatrix * mvPos;
  }
`;

const landFrag = /* glsl */ `
  uniform sampler2D uLandMask;
  uniform vec3 uSunDirection;
  uniform sampler2D uNightTex;
  uniform float uNightMix;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying float vElevation;

  void main() {
    // Land mask — max(R,G,B), threshold unchanged
    vec4 mask = texture2D(uLandMask, vUv);
    float landAlpha = max(mask.r, max(mask.g, mask.b));
    if (landAlpha < 0.1) discard;

    vec3 N = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float NdotV = max(dot(N, viewDir), 0.0);

    float elev = clamp(vElevation, 0.0, 1.0);

    // 5-stage satellite terrain colors (high contrast for 3D depth)
    vec3 coastColor = vec3(0.18, 0.38, 0.14);
    vec3 vegColor = vec3(0.30, 0.48, 0.18);
    vec3 aridColor = vec3(0.62, 0.50, 0.25);
    vec3 rockColor = vec3(0.42, 0.32, 0.28);
    vec3 snowColor = vec3(0.92, 0.94, 0.98);

    vec3 terrainColor;
    if (elev < 0.15) {
      terrainColor = mix(coastColor, vegColor, elev / 0.15);
    } else if (elev < 0.35) {
      terrainColor = mix(vegColor, aridColor, (elev - 0.15) / 0.20);
    } else if (elev < 0.60) {
      terrainColor = mix(aridColor, rockColor, (elev - 0.35) / 0.25);
    } else {
      terrainColor = mix(rockColor, snowColor, (elev - 0.60) / 0.40);
    }

    // Spherical falloff — subtle view-angle shading, no directional hillshade
    float viewShade = NdotV * 0.25 + 0.75;

    vec3 color = terrainColor * viewShade;

    // Day/night terminator — soft band (Glass-box: real sun position, not decorative)
    float sunDot = dot(normalize(vWorldNormal), uSunDirection);
    float dayFactor = smoothstep(-0.12, 0.12, sunDot);
    color *= mix(0.18, 1.0, dayFactor);

    // Night city lights (NASA Black Marble) — night side only, HD mode gated by uNightMix
    vec3 nightLights = texture2D(uNightTex, vUv).rgb;
    color += nightLights * vec3(1.0, 0.85, 0.6) * (1.0 - dayFactor) * uNightMix * 1.4;

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ── Ocean shader ────────────────────────────────────────────────────
// Shares the same world-normal terminator so land + ocean dim together
// (meshStandardMaterial's scene-light response was decoupled from uSunDirection).

const oceanVert = /* glsl */ `
  varying vec3 vWorldNormal;

  void main() {
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const oceanFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDirection;

  varying vec3 vWorldNormal;

  void main() {
    float sunDot = dot(normalize(vWorldNormal), uSunDirection);
    float dayFactor = smoothstep(-0.12, 0.12, sunDot);
    vec3 color = uColor * mix(0.35, 1.0, dayFactor);

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ── Component ───────────────────────────────────────────────────────

const OceanSphere = () => {
  const [ready, setReady] = useState(false);
  const landMatRef = useRef<THREE.ShaderMaterial>(null);
  const oceanMatRef = useRef<THREE.ShaderMaterial>(null);
  const frameCount = useRef(0);
  const qualityTier = useGlobeStore((s) => s.qualityPreset.tier);

  const landUniforms = useMemo(() => ({
    uLandMask: { value: null as THREE.Texture | null },
    uBumpMap: { value: null as THREE.Texture | null },
    uSunDirection: { value: getSunDirection() },
    uNightTex: { value: fallbackNightTex as THREE.Texture },
    uNightMix: { value: 0 },
  }), []);

  const oceanUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(GLOBE_COLORS.OCEAN) },
    uSunDirection: { value: getSunDirection() },
  }), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      texLoader.loadAsync(OS.LAND_MASK_TEXTURE),
      texLoader.loadAsync(DM.BUMP_TEXTURE),
    ]).then(([mask, bump]) => {
      if (cancelled) return;
      landUniforms.uLandMask.value = mask;
      landUniforms.uBumpMap.value = bump;
      if (landMatRef.current) landMatRef.current.needsUpdate = true;
      setReady(true);
    }).catch((err) => {
      logger.error('[OceanSphere] Texture load failed:', err);
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, [landUniforms]);

  // Night city-lights texture — mid/high tier only (Phase 6). hdMode 게이트는
  // 뺐다: setHdMode 소비 UI 가 없는 죽은 스위치라 걸면 프로덕션에서 영원히
  // 비활성 (dead-UI 정직성 — 타임라인 숨김과 동일 원칙). 158KB 단일 로드라
  // 티어 게이트로 충분.
  // Writes both the memoized uniforms object (covers the case where the
  // shaderMaterial hasn't mounted yet — !ready still shows the fallback mesh)
  // and the live material ref (covers the case where it already has — R3F
  // merge-copies the `uniforms` prop into the material's own uniform objects,
  // so post-mount writes must go through the ref to reach the GPU).
  useEffect(() => {
    const setNightState = (mix: number, tex?: THREE.Texture) => {
      landUniforms.uNightMix.value = mix;
      if (tex) landUniforms.uNightTex.value = tex;
      const mat = landMatRef.current;
      if (mat) {
        mat.uniforms.uNightMix.value = mix;
        if (tex) mat.uniforms.uNightTex.value = tex;
      }
    };

    if (qualityTier === 'low') {
      setNightState(0);
      return;
    }

    if (landUniforms.uNightTex.value !== fallbackNightTex) {
      // Already loaded from a prior tier change — just re-enable, skip re-fetch.
      setNightState(1);
      return;
    }

    let cancelled = false;
    texLoader.loadAsync(OS.NIGHT_TEXTURE).then((tex) => {
      if (cancelled) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      setNightState(1, tex);
    }).catch((err) => {
      logger.error('[OceanSphere] Night texture load failed:', err);
    });

    return () => { cancelled = true; };
  }, [qualityTier, landUniforms]);

  // Sun direction — refreshed ~once/sec via material refs (never mutate the
  // memoized uniforms objects directly at runtime: R3F merge-copies the
  // `uniforms` prop into the material's own uniform objects, so writes must
  // go through the material ref to reach the GPU — see CountryExtrude.tsx
  // for the same fix, proven in this codebase).
  useFrame(() => {
    frameCount.current += 1;
    if (frameCount.current % SUN_REFRESH_FRAMES !== 0) return;

    const sun = getSunDirection();
    if (landMatRef.current) landMatRef.current.uniforms.uSunDirection.value.copy(sun);
    if (oceanMatRef.current) oceanMatRef.current.uniforms.uSunDirection.value.copy(sun);
  });

  if (!ready) {
    return (
      <mesh>
        <sphereGeometry args={[1.0, 64, 48]} />
        <meshBasicMaterial color={GLOBE_COLORS.OCEAN} />
      </mesh>
    );
  }

  return (
    <group>
      {/* Ocean — terminator-matched shader (was meshStandardMaterial, scene-light only) */}
      <mesh>
        <sphereGeometry args={[1.0, 64, 48]} />
        <shaderMaterial
          ref={oceanMatRef}
          vertexShader={oceanVert}
          fragmentShader={oceanFrag}
          uniforms={oceanUniforms}
        />
      </mesh>

      {/* Land — altitude-colored flat sphere, day/night terminator + city lights */}
      <mesh>
        <sphereGeometry args={[1.001, 128, 96]} />
        <shaderMaterial
          ref={landMatRef}
          vertexShader={landVert}
          fragmentShader={landFrag}
          uniforms={landUniforms}
          side={THREE.FrontSide}
        />
      </mesh>
    </group>
  );
};

export default OceanSphere;
