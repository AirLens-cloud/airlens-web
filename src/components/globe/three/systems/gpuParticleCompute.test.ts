/**
 * gpuParticleCompute — pure-function invariants (AAA). Only the headless-safe
 * half is tested here (tier→count mapping, ring arithmetic, FPS guard,
 * shader string derivation). `createGpuParticleSystem` touches WebGL and is
 * verified by production Playwright smoke, not headless CI (see design doc
 * §7 P3 risk table).
 */
import { describe, it, expect } from 'vitest';
import {
  advectStep,
  getParticleCount,
  ringIndex,
  createLowTierFpsGuard,
  buildPositionComputeShader,
  buildTrailVertexShader,
  deltaFactor,
  createRingPushThrottle,
  getTrailRingSize,
  normalizeWindSpeed,
} from './gpuParticleCompute';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';

const { PARTICLES, WIND_TEXTURE, GPU_PARTICLES } = GLOBE_CONFIG.GLOBE_V2;

describe('getParticleCount', () => {
  it('maps each tier to its PARTICLES.COUNT_* SOT value', () => {
    // Arrange & Act & Assert
    expect(getParticleCount('high')).toBe(PARTICLES.COUNT_HIGH);
    expect(getParticleCount('medium')).toBe(PARTICLES.COUNT_MEDIUM);
    expect(getParticleCount('low')).toBe(PARTICLES.COUNT_LOW);
  });

  it('caps the high tier at COUNT_HIGH_MOBILE on mobile devices', () => {
    // Arrange & Act & Assert — desktop 200K raise must not leak to mobile,
    // even when the FPS monitor upgrades a mobile device into 'high'.
    expect(getParticleCount('high', true)).toBe(PARTICLES.COUNT_HIGH_MOBILE);
    expect(getParticleCount('medium', true)).toBe(PARTICLES.COUNT_MEDIUM);
    expect(getParticleCount('low', true)).toBe(PARTICLES.COUNT_LOW);
  });

  it('is monotonic: low <= medium <= high', () => {
    // Arrange & Act
    const low = getParticleCount('low');
    const medium = getParticleCount('medium');
    const high = getParticleCount('high');
    // Assert
    expect(low).toBeLessThanOrEqual(medium);
    expect(medium).toBeLessThanOrEqual(high);
  });
});

describe('getTrailRingSize', () => {
  it('gives higher-quality tiers longer readable history without penalising the low tier', () => {
    expect(getTrailRingSize('low')).toBe(GPU_PARTICLES.RING_SIZE_LOW);
    expect(getTrailRingSize('medium')).toBe(GPU_PARTICLES.RING_SIZE_MEDIUM);
    expect(getTrailRingSize('high')).toBe(GPU_PARTICLES.RING_SIZE_HIGH);
    expect(getTrailRingSize('low')).toBeLessThan(getTrailRingSize('medium'));
    expect(getTrailRingSize('medium')).toBeLessThan(getTrailRingSize('high'));
    // One extra vertex sampler is reserved for the pollution texture. WebGL2's
    // portable minimum is 16 vertex texture units.
    expect(getTrailRingSize('high') + 1).toBeLessThanOrEqual(16);

  });

  it('caps mobile high-tier history at the mobile ring size', () => {
    expect(getTrailRingSize('high', true)).toBe(GPU_PARTICLES.RING_SIZE_HIGH_MOBILE);
  });
});

describe('normalizeWindSpeed', () => {
  it('maps physical m/s magnitude into the shader range with a 40 m/s ceiling', () => {
    expect(normalizeWindSpeed(0, 0)).toBe(0);
    expect(normalizeWindSpeed(3, 4)).toBeCloseTo(5 / PARTICLES.SPEED_REFERENCE_MPS, 6);
    expect(normalizeWindSpeed(PARTICLES.SPEED_REFERENCE_MPS, 0)).toBe(1);
    expect(normalizeWindSpeed(PARTICLES.SPEED_REFERENCE_MPS * 2, 0)).toBe(1);
  });
});

describe('ringIndex', () => {
  it('returns head itself when segIdx is 0', () => {
    expect(ringIndex(2, 0, 3)).toBe(2);
  });

  it('walks backward through the ring as segIdx grows', () => {
    expect(ringIndex(2, 1, 3)).toBe(1);
    expect(ringIndex(2, 2, 3)).toBe(0);
  });

  it('wraps around past 0 (matches GLSL floored mod)', () => {
    // head=0, one slot older wraps to the last slot
    expect(ringIndex(0, 1, 3)).toBe(2);
    expect(ringIndex(0, 2, 3)).toBe(1);
  });

  it('always returns a value in [0, ringSize)', () => {
    for (let head = 0; head < 5; head++) {
      for (let seg = 0; seg < 8; seg++) {
        const idx = ringIndex(head, seg, 4);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(4);
      }
    }
  });
});

describe('createLowTierFpsGuard', () => {
  it('does not trip before the window fills', () => {
    // Arrange — 60fps frame pacing, but fewer frames than windowSize=5
    const guard = createLowTierFpsGuard(5, 30);
    // Act
    let tripped = false;
    for (let i = 0; i < 3; i++) tripped = guard.tick(i * 16.6) || tripped;
    // Assert
    expect(tripped).toBe(false);
    expect(guard.avgFps()).toBeNull();
  });

  it('trips once the window is full and average FPS is below the floor', () => {
    // Arrange — 15fps frame pacing (66ms/frame), floor=30
    const guard = createLowTierFpsGuard(5, 30);
    let now = 0;
    let tripped = false;
    // Act
    for (let i = 0; i < 6; i++) {
      now += 66;
      tripped = guard.tick(now) || tripped;
    }
    // Assert
    expect(tripped).toBe(true);
    expect(guard.avgFps()).toBeLessThan(30);
  });

  it('does not trip when average FPS holds above the floor', () => {
    // Arrange — 60fps frame pacing, floor=30
    const guard = createLowTierFpsGuard(5, 30);
    let now = 0;
    let tripped = false;
    // Act
    for (let i = 0; i < 6; i++) {
      now += 16.6;
      tripped = guard.tick(now) || tripped;
    }
    // Assert
    expect(tripped).toBe(false);
  });

  it('tracks the worst frame in the window separately from the average', () => {
    // Arrange — one slow frame (100ms) among fast frames (16.6ms), window=5
    const guard = createLowTierFpsGuard(5, 30);
    let now = 0;
    const deltas = [16.6, 16.6, 100, 16.6, 16.6, 16.6];
    // Act
    for (const d of deltas) {
      now += d;
      guard.tick(now);
    }
    // Assert
    expect(guard.minFps()).toBeLessThan(15); // 1000/100
    expect(guard.avgFps()).toBeGreaterThan(guard.minFps() as number);
  });

  it('uses the GPU_PARTICLES config defaults when no args are given', () => {
    // Arrange & Act
    const guard = createLowTierFpsGuard();
    // Assert — constructed without throwing, window not yet full
    expect(guard.tick(0)).toBe(false);
    void GPU_PARTICLES.LOW_TIER_FPS_FLOOR; // documents the SOT this defaults from
  });
});

describe('deltaFactor', () => {
  it('returns 1.0 at exactly 60fps pacing', () => {
    // Arrange & Act & Assert
    expect(deltaFactor(1 / 60)).toBeCloseTo(1.0, 5);
  });

  it('halves the step on a 120Hz display', () => {
    expect(deltaFactor(1 / 120)).toBeCloseTo(0.5, 5);
  });

  it('clamps a background-tab return delta to MAX_DELTA_S', () => {
    // Arrange — 5s away from the tab must not advect 300 frames worth
    const clampedMax = PARTICLES.MAX_DELTA_S * PARTICLES.REFERENCE_FPS;
    // Act & Assert
    expect(deltaFactor(5)).toBe(clampedMax);
    expect(deltaFactor(PARTICLES.MAX_DELTA_S)).toBe(clampedMax);
  });

  it('never returns a negative factor', () => {
    expect(deltaFactor(-0.016)).toBe(0);
  });
});

describe('createRingPushThrottle', () => {
  it('samples exactly at the configured visual cadence on a 60fps display', () => {
    // Arrange
    const throttle = createRingPushThrottle();
    // Act
    const pushes = Array.from({ length: 60 }, () => throttle.tick(1 / 60)).filter(Boolean);
    // Assert
    expect(pushes).toHaveLength(PARTICLES.TRAIL_SAMPLE_FPS);
  });

  it('keeps the same sampling cadence on a 120Hz display', () => {
    // Arrange
    const throttle = createRingPushThrottle();
    // Act
    const results = Array.from({ length: 120 }, () => throttle.tick(1 / 120));
    // Assert
    expect(results.filter(Boolean)).toHaveLength(PARTICLES.TRAIL_SAMPLE_FPS);
  });

  it('pushes only once for a long frame spanning several intervals', () => {
    // Arrange — only one new position exists to snapshot regardless of gap
    const throttle = createRingPushThrottle();
    // Act & Assert
    expect(throttle.tick(0.05)).toBe(true);
    expect(throttle.tick(0)).toBe(false);
  });
});

describe('buildPositionComputeShader', () => {
  it('bakes MAX_AGE and SPEED_FACTOR from config into the shader source', () => {
    // Arrange & Act
    const shader = buildPositionComputeShader();
    // Assert
    expect(shader).toContain(PARTICLES.MAX_AGE.toFixed(1));
    expect(shader).toContain(PARTICLES.SPEED_FACTOR.toFixed(6));
    expect(shader).toContain(PARTICLES.SPEED_REFERENCE_MPS.toFixed(1));
  });

  it('bakes the wind texture scale range from config', () => {
    // Arrange & Act
    const shader = buildPositionComputeShader();
    const range = (WIND_TEXTURE.SCALE_MAX - WIND_TEXTURE.SCALE_MIN).toFixed(4);
    // Assert
    expect(shader).toContain(WIND_TEXTURE.SCALE_MIN.toFixed(4));
    expect(shader).toContain(range);
  });

  it('declares uWindTexture and uTime uniforms, samples texturePosition without redeclaring it', () => {
    // Arrange & Act
    const shader = buildPositionComputeShader();
    // Assert
    expect(shader).toContain('uniform sampler2D uWindTexture;');
    expect(shader).toContain('uniform float uTime;');
    expect(shader).toContain('texture2D(texturePosition, uv)');
    expect(shader).not.toContain('uniform sampler2D texturePosition;'); // GPUComputationRenderer auto-declares dependencies
  });

  it('advects and ages through the uDeltaFactor uniform (refresh-rate independence)', () => {
    // Arrange & Act
    const shader = buildPositionComputeShader();
    // Assert — both displacement and aging must scale with the frame delta
    expect(shader).toContain('uniform float uDeltaFactor;');
    expect(shader).toContain(`float step = ${PARTICLES.SPEED_FACTOR.toFixed(6)} * uDeltaFactor;`);
    expect(shader).toContain('age += uDeltaFactor;');
    expect(shader).not.toContain('age += 1.0;');
  });

  // ── CPU/GPU mirror: the GLSL else-branch must implement advectStep() ──────
  // WebGL can't run in this suite, so the mirror is asserted structurally —
  // same technique as ringIndex ⇄ GLSL mod() (both formulas, one source of
  // constants). A change to advectStep() that skips the shader fails here.
  it('mirrors advectStep: cos(lat) longitude correction with the config floor', () => {
    // Arrange & Act
    const shader = buildPositionComputeShader();
    // Assert
    expect(shader).toContain(`max(cos(radians(lat)), ${PARTICLES.COS_LAT_FLOOR.toFixed(4)})`);
    expect(shader).toContain('u * step / cosLat');
    // The pre-fix formula advected longitude with no latitude correction.
    expect(shader).not.toContain('lon += u * step;');
  });

  it('mirrors advectStep: per-step displacement cap on both components', () => {
    // Arrange & Act
    const shader = buildPositionComputeShader();
    const cap = PARTICLES.MAX_STEP_DEG.toFixed(4);
    // Assert
    expect(shader).toContain(`clamp(u * step / cosLat, -${cap}, ${cap})`);
    expect(shader).toContain(`clamp(v * step, -${cap}, ${cap})`);
  });
});

describe('advectStep', () => {
  const DT = 1; // one 60fps-normalized frame
  const step = PARTICLES.SPEED_FACTOR * DT;

  it('moves a particle downwind proportionally to u and v at the equator', () => {
    // Arrange — cos(0°) = 1, so the longitude step is the uncorrected one
    const u = 10;
    const v = 5;
    // Act
    const next = advectStep(0, 0, u, v, DT);
    // Assert
    expect(next.lon).toBeCloseTo(u * step, 6);
    expect(next.lat).toBeCloseTo(v * step, 6);
  });

  it('scales the longitude step by 1/cos(lat) so ground speed is latitude-uniform', () => {
    // Arrange — the same wind at 0° and 60°; cos(60°) = 0.5 exactly
    const u = 10;
    // Act
    const equator = advectStep(0, 0, u, 0, DT);
    const midLat = advectStep(60, 0, u, 0, DT);
    // Assert — 60° must cover 2× the longitude degrees for the same ground distance
    expect(midLat.lon / equator.lon).toBeCloseTo(2, 4);
  });

  it('keeps ground-frame angular speed constant across the latitude band', () => {
    // Arrange — uniform 15 m/s zonal wind, the "speeds are all different" complaint
    const u = 15;
    // Act — dLon scaled back by cos(lat) recovers the ground-frame displacement
    const ground = [0, 15, 30, 45, 60, 75, 84].map((lat) => {
      const next = advectStep(lat, 0, u, 0, DT);
      return next.lon * Math.cos(lat * (Math.PI / 180));
    });
    // Assert — every latitude drifts at the same ground speed
    const mean = ground.reduce((a, b) => a + b, 0) / ground.length;
    for (const g of ground) expect(g).toBeCloseTo(mean, 6);
  });

  it('caps the per-step displacement at MAX_STEP_DEG under a polar extreme', () => {
    // Arrange — max encodable wind just inside the ±85° clamp, where 1/cos(lat)
    // amplification peaks. This is the "particles suddenly jump" case.
    const u = WIND_TEXTURE.SCALE_MAX;
    // Act
    const next = advectStep(84.9, 0, u, u, DT);
    // Assert
    expect(next.lon).toBeLessThanOrEqual(PARTICLES.MAX_STEP_DEG);
    expect(Math.abs(next.lat - 84.9)).toBeLessThanOrEqual(PARTICLES.MAX_STEP_DEG);
  });

  it('floors the cos(lat) divisor so the amplification stays finite at the pole', () => {
    // Arrange & Act — cos(89.99°) ≈ 0 would divide by ~0 without the floor
    const next = advectStep(84.9, 0, 1, 0, DT);
    // Assert — bounded by the floor-derived maximum, not Infinity/NaN
    expect(Number.isFinite(next.lon)).toBe(true);
    expect(next.lon).toBeLessThanOrEqual(step / PARTICLES.COS_LAT_FLOOR);
  });

  it('clamps latitude to ±85 and wraps longitude across the antimeridian', () => {
    // Arrange & Act — strong poleward wind, and a particle at the dateline
    const poleward = advectStep(84.99, 0, 0, WIND_TEXTURE.SCALE_MAX, DT);
    const wrapped = advectStep(0, 179.99, WIND_TEXTURE.SCALE_MAX, 0, DT);
    // Assert
    expect(poleward.lat).toBeLessThanOrEqual(85);
    expect(wrapped.lon).toBeLessThan(0); // wrapped into [-180, 0)
    expect(wrapped.lon).toBeGreaterThanOrEqual(-180);
  });

  it('does not move a particle when the frame delta is zero', () => {
    // Arrange & Act — a paused/zero-delta frame must be a no-op
    const next = advectStep(37.5, 127.0, 50, -20, 0);
    // Assert
    expect(next.lat).toBe(37.5);
    expect(next.lon).toBe(127.0);
  });

  it('holds a 1000-step trajectory inside valid bounds (long-run stability)', () => {
    // Arrange — max-speed wind, repeatedly integrated
    let lat = 10;
    let lon = 0;
    // Act
    for (let i = 0; i < 1000; i++) {
      const next = advectStep(lat, lon, WIND_TEXTURE.SCALE_MAX, WIND_TEXTURE.SCALE_MAX, 1);
      lat = next.lat;
      lon = next.lon;
    }
    // Assert — never escapes the clamp/wrap envelope, never goes NaN
    expect(lat).toBeGreaterThanOrEqual(-85);
    expect(lat).toBeLessThanOrEqual(85);
    expect(lon).toBeGreaterThanOrEqual(-180);
    expect(lon).toBeLessThanOrEqual(180);
  });
});

describe('buildTrailVertexShader', () => {
  it('emits one uRing<N> uniform per ring slot', () => {
    // Arrange & Act
    const shader = buildTrailVertexShader(3, 1.005);
    // Assert
    expect(shader).toContain('uniform sampler2D uRing0;');
    expect(shader).toContain('uniform sampler2D uRing1;');
    expect(shader).toContain('uniform sampler2D uRing2;');
    expect(shader).not.toContain('uRing3');
  });

  it('bakes the globe radius into the sphere-position formula', () => {
    // Arrange & Act
    const shader = buildTrailVertexShader(3, 1.005);
    // Assert
    expect(shader).toContain('1.005000');
  });

  it('emits the varyings the CPU fragment shader expects (vAlpha/vSpeed/vPollution)', () => {
    // Arrange & Act
    const shader = buildTrailVertexShader(GPU_PARTICLES.RING_SIZE_HIGH, 1.005);
    // Assert
    expect(shader).toContain('varying float vAlpha;');
    expect(shader).toContain('varying float vSpeed;');
    expect(shader).toContain('varying float vPollution;');
  });

  it('scales the ring branch count with ringSize', () => {
    // Arrange & Act
    const shaderTwo = buildTrailVertexShader(2, 1.0);
    const shaderFour = buildTrailVertexShader(4, 1.0);
    // Assert
    expect(shaderTwo).not.toContain('uRing2');
    expect(shaderFour).toContain('uRing3');
  });

  it('collapses a segment that crosses a respawn reset or an impossible spatial jump', () => {
    // Arrange & Act — a rendered GL_LINES pair is ordered newer → older.
    const shader = buildTrailVertexShader(GPU_PARTICLES.RING_SIZE_HIGH, 1.005);

    // Assert — both vertices in a GL_LINES pair share aSegmentAge, so the
    // whole segment receives the same validity result. Checking each endpoint
    // independently only moves the long connector into the following pair.
    expect(shader).toContain('attribute float aSegmentAge;');
    expect(shader).toContain('vec4 newerData = sampleRing(aSegmentAge, particleUv);');
    expect(shader).toContain('vec4 olderData = sampleRing(aSegmentAge + 1.0, particleUv);');
    expect(shader).toContain('bool crossedRespawn = olderData.b > newerData.b + 0.001;');
    expect(shader).toContain('bool segmentTooLong = distance(olderPos, newerPos) >');
    expect(shader).toContain('if (crossedRespawn || segmentTooLong)');
    expect(shader).toContain('pos = newerPos;');
    expect(shader).toContain('vAlpha = 0.0;');
  });
});
