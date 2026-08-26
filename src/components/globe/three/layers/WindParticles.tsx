/**
 * WindParticles — nullschool-style wind trail system on the 3D globe.
 *
 * Each particle maintains a history of positions rendered as LineSegments
 * with per-vertex alpha fade (head→tail) and speed-based color ramp via
 * GLSL (blue→teal→green→orange→red→violet).
 *
 * Advects particles by sampling the wind DataTexture each frame.
 * Particle count and trail history length both adapt to quality tier.
 */
import { useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGlobeStore } from '../../../../store/globeStore';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';
import { aqiToPm25 } from '../../../../lib/config/aqi';
import { WIND_SPEED_MAX_MPS, WIND_SPEED_RAMP } from '../../../../lib/earth/config';
import { latLonToVec3, GLOBE_R } from '../systems/geoUtils';
import { useGlobeMarkers } from '../../../../hooks/useGlobeData';
import { useWindTexture } from '../../../../hooks/useWindTexture';
import { useFireSources } from '../../../../hooks/useFireSources';
import { advectStep, deltaFactor, normalizeWindSpeed } from '../systems/gpuParticleCompute';
import {
  buildSpatialGrid,
  queryGrid,
  POLLUTION_MAX_PM25,
  POLLUTION_MIN_PM25,
  FIRE_FRP_TO_PM25_FACTOR,
  FIRE_FRP_DEFAULT,
  FIRE_PM25_THRESHOLD,
} from '../systems/pollutionGrid';
import type { PollutionSource } from '../../../../types/globe';

const { PARTICLES, WIND_TEXTURE } = GLOBE_CONFIG.GLOBE_V2;
const DEG2RAD = Math.PI / 180;

function getTrailCount(tier: string): number {
  const { TRAIL_COUNTS } = GLOBE_CONFIG.GLOBE_V2.WIND_TRAILS;
  return TRAIL_COUNTS[tier as keyof typeof TRAIL_COUNTS] ?? TRAIL_COUNTS.low;
}

function getTrailLen(tier: string): number {
  const { TRAIL_LENGTHS } = GLOBE_CONFIG.GLOBE_V2.WIND_TRAILS;
  return TRAIL_LENGTHS[tier as keyof typeof TRAIL_LENGTHS] ?? TRAIL_LENGTHS.low;
}

// ── GLSL shaders ────────────────────────────────────────────────────

function toGlslVec3([r, g, b]: readonly [number, number, number]): string {
  return `vec3(${(r / 255).toFixed(4)}, ${(g / 255).toFixed(4)}, ${(b / 255).toFixed(4)})`;
}

/** Bake the shared physical ramp into a compact GLSL function. */
function buildWindRampGlsl(): string {
  const intervals = WIND_SPEED_RAMP.slice(0, -1).map(([fromSpeed, fromColor], index) => {
    const [toSpeed, toColor] = WIND_SPEED_RAMP[index + 1];
    const from = fromSpeed / WIND_SPEED_MAX_MPS;
    const to = toSpeed / WIND_SPEED_MAX_MPS;
    return `if (speed <= ${to.toFixed(6)}) {
      float t = clamp((speed - ${from.toFixed(6)}) / ${(to - from).toFixed(6)}, 0.0, 1.0);
      return mix(${toGlslVec3(fromColor)}, ${toGlslVec3(toColor)}, t);
    }`;
  });
  const fallback = WIND_SPEED_RAMP.at(-1)?.[1] ?? [255, 255, 255];
  return `${intervals.join('\n    ')}\n    return ${toGlslVec3(fallback)};`;
}

const WIND_RAMP_GLSL = buildWindRampGlsl();

const trailVertShader = /* glsl */ `
  attribute float aAlpha;
  attribute float aSpeed;
  attribute float aPollution;
  varying float vAlpha;
  varying float vSpeed;
  varying float vPollution;
  void main() {
    vAlpha = aAlpha;
    vSpeed = aSpeed;
    vPollution = aPollution;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Exported for the SOT-derivation test and for WindParticlesGPU (P3) — the
 * fragment stage only consumes vAlpha/vSpeed/vPollution varyings, which are
 * identical whether the vertex shader computed them on the CPU (this file)
 * or sampled them from GPU compute textures, so the GPU path reuses this
 * shader verbatim instead of re-deriving the color ramp.
 */
export const trailFragShader = /* glsl */ `
  varying float vAlpha;
  varying float vSpeed;
  varying float vPollution;
  // V-W3 — timeline honesty dim. Wind has no forecast feed (surface/850hPa only),
  // so while the P8b timeline shows a past/future PM2.5 frame, particles must not
  // read as "the forecast wind" — see GLOBE_CONFIG.GLOBE_HEATMAP.WIND_TIMELINE_DIM_OPACITY.
  // Both consumers (CPU WindParticles / GPU WindParticlesGPU) must pass an initial
  // uOpacity uniform value of 1 — an unset GLSL uniform reads as 0 (fully dimmed),
  // not 1, so this is not an "opt-in when needed" default.
  uniform float uOpacity;
  // Pollution colour is an explicit FLOW-mode layer, never a silent override
  // of the wind-speed legend.
  uniform float uPollutionMix;

  vec3 windColor(float speed) {
    ${WIND_RAMP_GLSL}
  }

  void main() {
    float speedShape = pow(clamp(vSpeed, 0.0, 1.0), 0.72);
    vec3 windCol = windColor(clamp(vSpeed, 0.0, 1.0));

    // AQI color ramp (polluted regions — WHO tier colors)
    vec3 aqiGood   = vec3(0.29, 0.85, 0.50);  // #4ade80
    vec3 aqiMod    = vec3(0.98, 0.75, 0.14);  // #fbbf24
    vec3 aqiUSG    = vec3(0.98, 0.55, 0.15);  // #f97316
    vec3 aqiUnheal = vec3(0.93, 0.26, 0.26);  // #ef4444
    vec3 aqiHazard = vec3(0.42, 0.13, 0.66);  // #6b21a8

    vec3 aqiCol;
    if (vPollution < 0.2) {
      aqiCol = mix(aqiGood, aqiMod, vPollution / 0.2);
    } else if (vPollution < 0.4) {
      aqiCol = mix(aqiMod, aqiUSG, (vPollution - 0.2) / 0.2);
    } else if (vPollution < 0.6) {
      aqiCol = mix(aqiUSG, aqiUnheal, (vPollution - 0.4) / 0.2);
    } else {
      aqiCol = mix(aqiUnheal, aqiHazard, (vPollution - 0.6) / 0.4);
    }

    float pollBlend = smoothstep(0.05, 0.15, vPollution)
      * uPollutionMix * ${PARTICLES.POLLUTION_BLEND_MAX.toFixed(2)};
    vec3 col = mix(windCol, aqiCol, pollBlend);

    // Breathline: physical movement is the primary speed cue; trail reveal and
    // colour temperature redundantly preserve the reading in a still frame.
    float tailCutoff = mix(${PARTICLES.TRAIL_CALM_CUTOFF.toFixed(2)}, ${PARTICLES.TRAIL_FAST_CUTOFF.toFixed(2)}, speedShape);
    float trailReveal = smoothstep(tailCutoff, 1.0, vAlpha);
    float trailShape = pow(clamp(vAlpha, 0.0, 1.0), ${PARTICLES.TRAIL_ALPHA_POWER.toFixed(2)});
    float brightness = mix(0.56, 1.08, speedShape);
    brightness *= 1.0 + vPollution * 0.25 * uPollutionMix;
    float alpha = trailShape * trailReveal * brightness;
    float pollAlpha = mix(0.82, 1.0, vPollution * uPollutionMix);

    gl_FragColor = vec4(col, alpha * pollAlpha * uOpacity);
  }
`;

// ── Per-particle state ──────────────────────────────────────────────

interface ParticleState {
  lat: number;
  lon: number;
  age: number;
  history: THREE.Vector3[];
}

// ── Component ───────────────────────────────────────────────────────

interface WindParticlesProps {
  motionScale?: number;
}

const WindParticles = ({ motionScale = 1 }: WindParticlesProps) => {
  const qualityPreset = useGlobeStore((s) => s.qualityPreset);
  // V-W3 — dims while the P8b timeline shows a non-live frame (see trailFragShader header).
  const timeOffsetHours = useGlobeStore((s) => s.timeOffsetHours);
  const transportLens = useGlobeStore((s) => s.transportLens);
  const linesRef = useRef<THREE.LineSegments>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uOpacity: { value: 1 }, uPollutionMix: { value: 0 } }), []);
  const windTex = useWindTexture();
  const particlesRef = useRef<ParticleState[]>([]);
  const pollutionRef = useRef<PollutionSource[]>([]);
  const gridRef = useRef<Map<string, PollutionSource[]>>(new Map());

  const count = getTrailCount(qualityPreset.tier);
  const trailLen = getTrailLen(qualityPreset.tier);
  const segsPerParticle = trailLen - 1;
  const vertsPerParticle = segsPerParticle * 2;
  const totalVerts = count * vertsPerParticle;

  const rawMarkers = useGlobeMarkers();
  const fireSources = useFireSources();
  useEffect(() => {
    const sources: PollutionSource[] = [];
    for (const item of rawMarkers) {
      const m = item as Record<string, unknown>;
      const loc = m.location as { lat?: number; lon?: number } | undefined;
      if (!loc?.lat || !loc?.lon) continue;
      const aqi = typeof m.aqi === 'number' ? m.aqi : 0;
      if (aqi <= 0) continue;
      const pm25 = aqiToPm25(aqi);
      if (pm25 >= POLLUTION_MIN_PM25) {
        sources.push({ lat: loc.lat, lon: loc.lon, pm25 });
      }
    }
    for (const fire of fireSources) {
      const frpPm25 = Math.min((fire.frp ?? FIRE_FRP_DEFAULT) * FIRE_FRP_TO_PM25_FACTOR, POLLUTION_MAX_PM25);
      if (frpPm25 >= FIRE_PM25_THRESHOLD) {
        sources.push({ lat: fire.lat, lon: fire.lon, pm25: frpPm25 });
      }
    }
    pollutionRef.current = sources;
    gridRef.current = buildSpatialGrid(sources);
  }, [rawMarkers, fireSources]);

  // Initialize geometry buffers + particle state
  const { positions, alphas, speeds, pollutions, states } = useMemo(() => {
    const pos = new Float32Array(totalVerts * 3);
    const alp = new Float32Array(totalVerts);
    const spd = new Float32Array(totalVerts);
    const pol = new Float32Array(totalVerts);

    const states: ParticleState[] = [];

    /* eslint-disable react-hooks/purity -- intentional random positions */
    for (let i = 0; i < count; i++) {
      const lat = Math.asin(2 * Math.random() - 1) / DEG2RAD;
      const lon = Math.random() * 360 - 180;
      const init = latLonToVec3(lat, lon, GLOBE_R);
      const history: THREE.Vector3[] = [];
      for (let h = 0; h < trailLen; h++) history.push(init.clone());
      states.push({ lat, lon, age: Math.random() * PARTICLES.MAX_AGE, history });

      // Set per-vertex alpha: head bright, tail faint
      for (let s = 0; s < segsPerParticle; s++) {
        const aHead = 1 - s / segsPerParticle;
        const aTail = 1 - (s + 1) / segsPerParticle;
        const base = i * vertsPerParticle + s * 2;
        alp[base] = aHead;
        alp[base + 1] = aTail;
      }
    }
    /* eslint-enable react-hooks/purity */

    return { positions: pos, alphas: alp, speeds: spd, pollutions: pol, states };
  }, [count, totalVerts, vertsPerParticle, segsPerParticle, trailLen]);

  useLayoutEffect(() => {
    particlesRef.current = positions ? states : [];
  }, [positions, states]);

  // Advection + trail update loop
  useFrame((_, delta) => {
    // V-W3 — timeline honesty dim, independent of the windTex/lines guard below so
    // it still settles even on the frame windTex first resolves.
    const material = materialRef.current;
    if (material) {
      const target = timeOffsetHours !== 0 ? GLOBE_CONFIG.GLOBE_HEATMAP.WIND_TIMELINE_DIM_OPACITY : 1;
      const cur = material.uniforms.uOpacity.value as number;
      const pollutionTarget = transportLens ? 1 : 0;
      const pollutionNow = material.uniforms.uPollutionMix.value as number;
      material.uniforms.uPollutionMix.value = pollutionNow
        + (pollutionTarget - pollutionNow) * Math.min(delta * 4, 1);
      material.uniforms.uOpacity.value = cur + (target - cur) * Math.min(delta * 3, 1);
    }

    const lines = linesRef.current;
    if (!lines || !windTex) return;

    // Same 60fps-normalized advection step as the GPU path's uDeltaFactor —
    // both paths must drift at identical wall-clock speed on any refresh rate.
    const dt = deltaFactor(delta) * motionScale;

    const posAttr = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const speedAttr = lines.geometry.getAttribute('aSpeed') as THREE.BufferAttribute;
    const polAttr = lines.geometry.getAttribute('aPollution') as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const spdArr = speedAttr.array as Float32Array;
    const polArr = polAttr.array as Float32Array;
    const grid = gridRef.current;

    const texData = windTex.image.data as Float32Array;
    const tw = WIND_TEXTURE.WIDTH;
    const th = WIND_TEXTURE.HEIGHT;
    const range = WIND_TEXTURE.SCALE_MAX - WIND_TEXTURE.SCALE_MIN;

    const particles = particlesRef.current;

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      p.age += dt;

      // Sample wind at current position
      const tx = Math.floor(((p.lon + 180) / 360) * tw) % tw;
      const ty = Math.floor(((90 - p.lat) / 180) * th);
      const tidx = (ty * tw + tx) * 4;
      const uNorm = texData[tidx];
      const vNorm = texData[tidx + 1];

      let u = 0, v = 0;
      if (uNorm !== undefined) {
        u = uNorm * range + WIND_TEXTURE.SCALE_MIN;
        v = (vNorm ?? 0) * range + WIND_TEXTURE.SCALE_MIN;
      }

      const speed = normalizeWindSpeed(u, v);

      const pollution = queryGrid(grid, p.lat, p.lon);

      // Respawn check
      const shouldRespawn = p.age >= PARTICLES.MAX_AGE || p.lat > 88 || p.lat < -88;
      if (shouldRespawn) {
        p.lat = Math.asin(2 * Math.random() - 1) / DEG2RAD;
        p.lon = Math.random() * 360 - 180;
        p.age = 0;
        const init = latLonToVec3(p.lat, p.lon, GLOBE_R);
        for (let h = 0; h < trailLen; h++) p.history[h].copy(init);
      } else {
        // Advect (shared with the GPU compute shader — see advectStep)
        const next = advectStep(p.lat, p.lon, u, v, dt);
        p.lat = next.lat;
        p.lon = next.lon;

        // Shift history (oldest falls off)
        for (let h = trailLen - 1; h > 0; h--) p.history[h].copy(p.history[h - 1]);
        p.history[0].copy(latLonToVec3(p.lat, p.lon, GLOBE_R));
      }

      // Write line segments: seg s connects history[s] → history[s+1]
      const basePart = i * vertsPerParticle * 3;
      const baseSp = i * vertsPerParticle;
      for (let s = 0; s < segsPerParticle; s++) {
        const h0 = p.history[s];
        const h1 = p.history[s + 1];
        const b = basePart + s * 6;
        posArr[b] = h0.x;     posArr[b + 1] = h0.y;     posArr[b + 2] = h0.z;
        posArr[b + 3] = h1.x; posArr[b + 4] = h1.y; posArr[b + 5] = h1.z;
        // Speed + pollution per segment
        spdArr[baseSp + s * 2] = speed;
        spdArr[baseSp + s * 2 + 1] = speed;
        polArr[baseSp + s * 2] = pollution;
        polArr[baseSp + s * 2 + 1] = pollution;
      }
    }

    posAttr.needsUpdate = true;
    speedAttr.needsUpdate = true;
    polAttr.needsUpdate = true;
  });

  if (!windTex) return null;

  return (
    <lineSegments ref={linesRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aAlpha" args={[alphas, 1]} />
        <bufferAttribute attach="attributes-aSpeed" args={[speeds, 1]} />
        <bufferAttribute attach="attributes-aPollution" args={[pollutions, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={trailVertShader}
        fragmentShader={trailFragShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
};

export default WindParticles;
