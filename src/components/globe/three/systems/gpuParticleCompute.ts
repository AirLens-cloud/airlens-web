/**
 * gpuParticleCompute — P3 GPU-advected wind particles (Stage B of the
 * nullschool realtime architecture, see wiki/synthesis
 * globe-nullschool-realtime-architecture-2026-07-12.md §6.1, §7 P3).
 *
 * Two halves, deliberately separated:
 *  - Pure functions (tier→count mapping, ring index arithmetic, shader
 *    string derivation, FPS-floor guard): no GPU dependency, unit-tested
 *    directly in this file's *.test.ts.
 *  - `createGpuParticleSystem`: the only function that touches
 *    GPUComputationRenderer / WebGL. Wrapped end-to-end in try/catch and
 *    returns null on any failure — the caller (WindParticlesGPU) falls back
 *    to the existing CPU WindParticles path. This must never throw: it runs
 *    on every visitor whose WebGL2 probe passed, including headless
 *    SwiftShader-class renderers where GPUComputationRenderer.init() can
 *    still legitimately report unsupported.
 */
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';
import type { QualityTier } from '../../../../lib/adaptiveQuality';
import type { GpuParticleSystem } from '../../../../types/globe';

const { PARTICLES, WIND_TEXTURE, GPU_PARTICLES } = GLOBE_CONFIG.GLOBE_V2;
const DEG2RAD = Math.PI / 180;

// ── Pure: tier → particle count (single SOT — PARTICLES.COUNT_*) ──────────

export function getParticleCount(tier: QualityTier, isMobileDevice = false): number {
  switch (tier) {
    case 'high':
      return isMobileDevice ? PARTICLES.COUNT_HIGH_MOBILE : PARTICLES.COUNT_HIGH;
    case 'medium':
      return PARTICLES.COUNT_MEDIUM;
    case 'low':
    default:
      return PARTICLES.COUNT_LOW;
  }
}

/** Tier → history depth. Longer high-tier paths replace unreadable sparkle density. */
export function getTrailRingSize(tier: QualityTier, isMobileDevice = false): number {
  switch (tier) {
    case 'high':
      return isMobileDevice ? GPU_PARTICLES.RING_SIZE_HIGH_MOBILE : GPU_PARTICLES.RING_SIZE_HIGH;
    case 'medium':
      return GPU_PARTICLES.RING_SIZE_MEDIUM;
    case 'low':
    default:
      return GPU_PARTICLES.RING_SIZE_LOW;
  }
}

/** Physical vector magnitude → shared 0–1 visual domain. */
export function normalizeWindSpeed(u: number, v: number): number {
  const magnitude = Math.hypot(u, v);
  if (!Number.isFinite(magnitude)) return 0;
  return Math.min(1, magnitude / PARTICLES.SPEED_REFERENCE_MPS);
}

// ── Pure: delta-time normalization (shared by CPU and GPU advection) ──────

/**
 * Frame delta (s) → advection multiplier normalized to REFERENCE_FPS.
 * 1.0 at exactly 60fps, ~0.5 at 120Hz, clamped so a background-tab return
 * (multi-second delta) cannot teleport particles across the globe.
 */
export function deltaFactor(deltaSeconds: number): number {
  const clamped = Math.min(Math.max(deltaSeconds, 0), PARTICLES.MAX_DELTA_S);
  return clamped * PARTICLES.REFERENCE_FPS;
}

/**
 * Time-based ring snapshot throttle. pushRing() used to run once per rAF
 * frame, so a 120Hz display halved the wall-clock span (and thus the visible
 * length) of the ring-buffer streak. Accumulating real time and pushing at
 * TRAIL_SAMPLE_FPS cadence keeps streak length refresh-rate independent.
 * A long frame spanning several intervals still pushes only once (there is
 * only one new position to snapshot), keeping the remainder.
 */
export function createRingPushThrottle(intervalS: number = 1 / PARTICLES.TRAIL_SAMPLE_FPS) {
  let acc = 0;
  return {
    /** Accumulate a frame's delta (s); returns true when a ring snapshot is due. */
    tick(deltaSeconds: number): boolean {
      acc += Math.min(Math.max(deltaSeconds, 0), PARTICLES.MAX_DELTA_S);
      if (acc + 1e-9 < intervalS) return false;
      acc = Math.max(0, acc - intervalS);
      return true;
    },
  };
}

// ── Pure: advection step (CPU path; GLSL mirror in buildPositionComputeShader) ──

/**
 * One advection step: u/v (m/s) at (lat, lon) → next lat/lon (deg).
 *
 * The longitude step divides by cos(lat) so equal wind speed covers equal
 * ground distance at every latitude (plate-carrée lon degrees shrink toward
 * the poles — without this, high-latitude flow reads systematically slow).
 * The divisor is floored at COS_LAT_FLOOR (= cos 85°, the advection lat
 * clamp) and each component is capped at ±MAX_STEP_DEG so decode extremes
 * can never teleport a particle.
 *
 * Mirrored 1:1 in buildPositionComputeShader's else-branch — change both
 * together (the mirror test asserts the baked constants).
 */
export function advectStep(
  lat: number,
  lon: number,
  u: number,
  v: number,
  dt: number,
): { lat: number; lon: number } {
  const step = PARTICLES.SPEED_FACTOR * dt;
  const cosLat = Math.max(Math.cos(lat * DEG2RAD), PARTICLES.COS_LAT_FLOOR);
  const cap = PARTICLES.MAX_STEP_DEG;
  const dLon = Math.max(-cap, Math.min(cap, (u * step) / cosLat));
  const dLat = Math.max(-cap, Math.min(cap, v * step));
  let nextLon = lon + dLon;
  if (nextLon > 180) nextLon -= 360;
  if (nextLon < -180) nextLon += 360;
  const nextLat = Math.max(-85, Math.min(85, lat + dLat));
  return { lat: nextLat, lon: nextLon };
}

// ── Pure: ring buffer index arithmetic ─────────────────────────────────────

/**
 * Index into an N-slot ring buffer, `segIdx` slots older than `head`.
 * Always returns a value in [0, ringSize) — JS `%` can return negative for
 * negative operands, which this guards against explicitly (used both in the
 * JS-side head counter and mirrored in GLSL, see buildTrailVertexShader).
 */
export function ringIndex(head: number, segIdx: number, ringSize: number): number {
  return ((head - segIdx) % ringSize + ringSize) % ringSize;
}

// ── Pure: sustained-low-FPS guard (last-resort GPU→CPU downgrade) ─────────

/**
 * Windowed FPS floor check for the "low tier still can't hold 30fps" last
 * resort (design doc §7 P3: "LOW 티어에서도 N초 연속 <30fps → CPU 강등").
 * Independent of adaptiveQuality's createFPSMonitor, which has no tier below
 * 'low' to downgrade into — this is a binary GPU-path→CPU-path trip, not a
 * tier change.
 */
export function createLowTierFpsGuard(
  windowSize: number = GPU_PARTICLES.LOW_TIER_FPS_WINDOW_FRAMES,
  floorFps: number = GPU_PARTICLES.LOW_TIER_FPS_FLOOR,
) {
  const frameTimes: number[] = [];
  let lastTime = 0;

  return {
    /** Call once per frame with a monotonically increasing `now` (ms). Returns true once sustained sub-floor FPS is detected. */
    tick(now: number): boolean {
      if (lastTime > 0) {
        const delta = now - lastTime;
        if (delta > 0) {
          frameTimes.push(delta);
          if (frameTimes.length > windowSize) frameTimes.shift();
        }
      }
      lastTime = now;
      if (frameTimes.length < windowSize) return false;
      const avgDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      return 1000 / avgDelta < floorFps;
    },
    /** Last computed average FPS, or null if the window hasn't filled yet. */
    avgFps(): number | null {
      if (frameTimes.length < windowSize) return null;
      const avgDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      return 1000 / avgDelta;
    },
    /** Worst instantaneous FPS in the current window (from the longest frame delta), or null if the window hasn't filled yet. */
    minFps(): number | null {
      if (frameTimes.length < windowSize) return null;
      return 1000 / Math.max(...frameTimes);
    },
  };
}

// ── Pure: GLSL string derivation (config → shader source) ─────────────────

/**
 * Advection compute shader for the `texturePosition` variable.
 * RGBA texel layout: R=lat(deg), G=lon(deg), B=age(frames), A=speed(0-1 norm).
 * The else-branch is a 1:1 GLSL mirror of `advectStep()` above (same
 * SPEED_FACTOR / cos(lat) correction / step cap / MAX_AGE / wind-texture
 * decode) so the GPU and CPU paths produce the same flow, not two
 * independently-tuned ones — change both together.
 */
export function buildPositionComputeShader(): string {
  const scaleMin = WIND_TEXTURE.SCALE_MIN.toFixed(4);
  const scaleRange = (WIND_TEXTURE.SCALE_MAX - WIND_TEXTURE.SCALE_MIN).toFixed(4);
  const speedFactor = PARTICLES.SPEED_FACTOR.toFixed(6);
  const maxAge = PARTICLES.MAX_AGE.toFixed(1);
  const cosLatFloor = PARTICLES.COS_LAT_FLOOR.toFixed(4);
  const maxStep = PARTICLES.MAX_STEP_DEG.toFixed(4);
  const speedReference = PARTICLES.SPEED_REFERENCE_MPS.toFixed(1);

  return /* glsl */ `
    uniform sampler2D uWindTexture;
    uniform float uTime;
    uniform float uDeltaFactor;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec4 data = texture2D(texturePosition, uv);
      float lat = data.r;
      float lon = data.g;
      float age = data.b;

      vec2 windUv = vec2((lon + 180.0) / 360.0, (90.0 - lat) / 180.0);
      vec4 wind = texture2D(uWindTexture, windUv);
      float u = wind.r * ${scaleRange} + ${scaleMin};
      float v = wind.g * ${scaleRange} + ${scaleMin};
      float speed = min(1.0, length(vec2(u, v)) / ${speedReference});

      bool respawn = age >= ${maxAge} || lat > 88.0 || lat < -88.0;

      if (respawn) {
        float r1 = rand(uv + vec2(uTime * 0.7013, 0.0));
        float r2 = rand(uv + vec2(0.0, uTime * 1.3187));
        lat = degrees(asin(2.0 * r1 - 1.0));
        lon = r2 * 360.0 - 180.0;
        age = 0.0;
        speed = 0.0;
      } else {
        // Mirror of advectStep(): cos(lat)-corrected longitude + per-step cap.
        float step = ${speedFactor} * uDeltaFactor;
        float cosLat = max(cos(radians(lat)), ${cosLatFloor});
        float dLon = clamp(u * step / cosLat, -${maxStep}, ${maxStep});
        float dLat = clamp(v * step, -${maxStep}, ${maxStep});
        lon += dLon;
        lat = clamp(lat + dLat, -85.0, 85.0);
        if (lon > 180.0) lon -= 360.0;
        if (lon < -180.0) lon += 360.0;
        age += uDeltaFactor;
      }

      gl_FragColor = vec4(lat, lon, age, speed);
    }
  `;
}

/**
 * Trail vertex shader — reads a particle's position from `ringSize` ring
 * texture snapshots (head = most recent) and reconstructs the sphere-surface
 * segment endpoints. Emits vAlpha/vSpeed/vPollution so the fragment stage
 * can reuse WindParticles.tsx's `trailFragShader` verbatim.
 *
 * `ringSize` is a compile-time constant baked into the shader (fixed uniform
 * count `uRing0..uRing{N-1}` + an if/else chain) rather than a dynamically
 * indexed sampler array — GLSL ES 1.00 vertex stages cannot dynamically
 * index sampler arrays portably.
 */
export function buildTrailVertexShader(ringSize: number, globeRadius: number): string {
  const r = globeRadius.toFixed(6);
  const maxSegmentChord = (
    2 * globeRadius * Math.sin((PARTICLES.TRAIL_MAX_SEGMENT_DEG * DEG2RAD) / 2)
  ).toFixed(6);
  const uniforms = Array.from({ length: ringSize }, (_, i) => `uniform sampler2D uRing${i};`).join('\n      ');
  const branches = Array.from({ length: ringSize }, (_, i) =>
    `${i === 0 ? 'if' : 'else if'} (idx < ${(i + 0.5).toFixed(1)}) ringData = texture2D(uRing${i}, particleUv);`,
  ).join('\n        ');

  return /* glsl */ `
      attribute float aAlpha;
      attribute float aParticleIndex;
      attribute float aRingAge;
      attribute float aSegmentAge;
      uniform float uHead;
      uniform float uTexSize;
      uniform sampler2D uPollutionTexture;
      ${uniforms}
      varying float vAlpha;
      varying float vSpeed;
      varying float vPollution;

      vec4 sampleRing(float ringAge, vec2 particleUv) {
        // GLSL mod() is floored (always non-negative for a positive divisor,
        // unlike JS %) — mirrors the JS-side ringIndex() helper exactly.
        float idx = mod(uHead - ringAge, ${ringSize}.0);
        vec4 ringData = vec4(0.0);
        ${branches}
        return ringData;
      }

      vec3 spherePosition(vec4 ringData) {
        float phi = radians(90.0 - ringData.r);
        float theta = radians(ringData.g + 180.0);
        return vec3(
          -${r} * sin(phi) * cos(theta),
          ${r} * cos(phi),
          ${r} * sin(phi) * sin(theta)
        );
      }

      void main() {
        vAlpha = aAlpha;
        float ix = mod(aParticleIndex, uTexSize);
        float iy = floor(aParticleIndex / uTexSize);
        vec2 particleUv = (vec2(ix, iy) + 0.5) / uTexSize;

        // Both endpoints of a GL_LINES pair share aSegmentAge and therefore
        // compute the same validity result. Endpoint-local checks merely move
        // a discontinuity into the following pair because vertices are duplicated.
        vec4 newerData = sampleRing(aSegmentAge, particleUv);
        vec4 olderData = sampleRing(aSegmentAge + 1.0, particleUv);
        vec3 newerPos = spherePosition(newerData);
        vec3 olderPos = spherePosition(olderData);
        bool crossedRespawn = olderData.b > newerData.b + 0.001;
        bool segmentTooLong = distance(olderPos, newerPos) > ${maxSegmentChord};

        bool olderEndpoint = aRingAge > aSegmentAge + 0.5;
        vec4 data = olderEndpoint ? olderData : newerData;
        vec3 pos = olderEndpoint ? olderPos : newerPos;
        if (crossedRespawn || segmentTooLong) {
          data = newerData;
          pos = newerPos;
          vAlpha = 0.0;
        }

        float lat = data.r;
        float lon = data.g;
        vSpeed = data.a;
        vec2 pollUv = vec2((lon + 180.0) / 360.0, (90.0 - lat) / 180.0);
        vPollution = texture2D(uPollutionTexture, pollUv).r;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;
}

// ── GPU-touching factory (try/catch guarded, never throws) ────────────────
// GpuParticleSystem itself lives in types/globe.ts (shared with WindParticlesGPU.tsx).

function randomInitialPositionTexture(gpuCompute: InstanceType<typeof GPUComputationRenderer>, count: number, texSize: number): THREE.DataTexture {
  const texture = gpuCompute.createTexture() as THREE.DataTexture;
  const data = texture.image.data as Float32Array;
  const total = texSize * texSize;
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    if (i < count) {
      const lat = Math.asin(2 * Math.random() - 1) / DEG2RAD;
      const lon = Math.random() * 360 - 180;
      data[idx] = lat;
      data[idx + 1] = lon;
      data[idx + 2] = Math.random() * PARTICLES.MAX_AGE;
      data[idx + 3] = 0;
    } else {
      // Idle texel beyond this tier's particle count — parked at the pole,
      // never rendered (geometry only emits vertices for [0, count)).
      data[idx] = 90;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 0;
    }
  }
  return texture;
}

/**
 * Constructs the GPUComputationRenderer + ring render targets. Returns null
 * on any failure (unsupported GPU, shader compile error, OOM) — callers must
 * treat null as "fall back to CPU WindParticles", never as fatal.
 */
export function createGpuParticleSystem(
  gl: THREE.WebGLRenderer,
  opts: { count: number; texSize: number; ringSize: number },
): GpuParticleSystem | null {
  try {
    const { count, texSize, ringSize } = opts;
    const gpuCompute = new GPUComputationRenderer(texSize, texSize, gl) as InstanceType<typeof GPUComputationRenderer>;

    const initialTexture = randomInitialPositionTexture(gpuCompute, count, texSize);
    const posVar = gpuCompute.addVariable('texturePosition', buildPositionComputeShader(), initialTexture);
    gpuCompute.setVariableDependencies(posVar, [posVar]);
    posVar.material.uniforms.uWindTexture = { value: null };
    posVar.material.uniforms.uTime = { value: 0 };
    posVar.material.uniforms.uDeltaFactor = { value: 1 };
    // wrapS/wrapT/minFilter/magFilter left at addVariable's defaults
    // (ClampToEdge + NearestFilter) — texturePosition indexes particles by
    // texel position, not geography, so it must never wrap or interpolate
    // between unrelated particles' texels.

    const error = gpuCompute.init();
    if (error !== null) {
      return null;
    }

    const ringTargets: THREE.WebGLRenderTarget[] = [];
    for (let i = 0; i < ringSize; i++) {
      const rt = gpuCompute.createRenderTarget(texSize, texSize, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.NearestFilter, THREE.NearestFilter);
      gpuCompute.renderTexture(initialTexture, rt);
      ringTargets.push(rt);
    }

    let head = 0;

    return {
      compute(elapsedSeconds: number, advectionDeltaFactor: number) {
        posVar.material.uniforms.uTime.value = elapsedSeconds;
        posVar.material.uniforms.uDeltaFactor.value = advectionDeltaFactor;
        gpuCompute.compute();
      },
      pushRing() {
        head = (head + 1) % ringSize;
        const current = gpuCompute.getCurrentRenderTarget(posVar) as THREE.WebGLRenderTarget;
        gpuCompute.renderTexture(current.texture, ringTargets[head]);
      },
      getRingTexture(i: number) {
        return ringTargets[i].texture;
      },
      headIndex() {
        return head;
      },
      setWindTexture(tex: THREE.Texture | null) {
        posVar.material.uniforms.uWindTexture.value = tex;
      },
      texSize,
      ringSize,
      dispose() {
        try {
          gpuCompute.dispose();
        } catch {
          /* renderer already gone (context loss) — nothing left to free */
        }
        for (const rt of ringTargets) rt.dispose();
      },
    };
  } catch {
    return null;
  }
}
