/**
 * WindParticles ↔ GlobeLegend wind ramp SOT unification (2차 P4, AAA).
 *
 * Prior to this fix the wind legend (COLOR_BAR_CONFIGS.wind) rendered an unrelated
 * 12-stop sinebow scale (NULLSCHOOL_WIND_SEGMENTS) while the actual particle shader
 * in WindParticles.tsx used its own hardcoded cyan→yellow→red literals — the two
 * could never represent the same thing. These tests guard that both now derive
 * from the single WIND_SPEED_RAMP array in lib/earth/config.ts.
 */
import { describe, it, expect } from 'vitest';
import { WIND_SPEED_MAX_MPS, WIND_SPEED_RAMP, segmentsToGradient } from '../../../../lib/earth/config';
import { COLOR_BAR_CONFIGS } from '../../../../lib/config/globeOverlays';
import { trailFragShader } from './WindParticles';
import * as earthConfig from '../../../../lib/earth/config';

describe('WIND_SPEED_RAMP — shader/legend single source of truth', () => {
  it('uses surface-readable physical breakpoints instead of the unreachable 75–250 m/s range', () => {
    // Arrange & Act
    const speeds = WIND_SPEED_RAMP.map(([speed]) => speed);
    // Assert — the checked-in surface field is centred near 5.6 m/s and peaks
    // near 23 m/s, so these stops keep its real variation visible.
    expect(speeds).toEqual([0, 5, 10, 20, 30, 40]);
    expect(WIND_SPEED_MAX_MPS).toBe(40);
  });

  it('bakes WIND_SPEED_RAMP RGB stops into the generated GLSL string (physically tied, not re-typed)', () => {
    const toGlslVec3 = ([r, g, b]: readonly [number, number, number]) =>
      `vec3(${(r / 255).toFixed(4)}, ${(g / 255).toFixed(4)}, ${(b / 255).toFixed(4)})`;
    // Act & Assert
    for (const [, color] of WIND_SPEED_RAMP) {
      expect(trailFragShader).toContain(toGlslVec3(color));
    }
  });

  it("wind legend gradient is generated from WIND_SPEED_RAMP (same call the shader's colors trace back to)", () => {
    // Arrange & Act
    const expected = segmentsToGradient(WIND_SPEED_RAMP);
    // Assert
    expect(COLOR_BAR_CONFIGS.wind?.gradient).toBe(expected);
    expect(COLOR_BAR_CONFIGS.wind?.ticks).toEqual(['0', '5', '10', '20', '30', '40']);
  });

  it('uses speed to reveal longer trails and only enables pollution tint through an explicit uniform', () => {
    expect(trailFragShader).toContain('uniform float uPollutionMix;');
    expect(trailFragShader).toContain('float tailCutoff = mix(');
    expect(trailFragShader).toContain('float trailReveal = smoothstep(tailCutoff, 1.0, vAlpha);');
  });

  it('removes the deprecated disconnected scales (NULLSCHOOL_WIND_SEGMENTS / WIND_PARTICLE_COLORS / GRAY_COLORS)', () => {
    // Assert — symbols no longer exported (also enforced at compile time: any
    // lingering reference elsewhere would fail `tsc`)
    expect((earthConfig as Record<string, unknown>).NULLSCHOOL_WIND_SEGMENTS).toBeUndefined();
    expect((earthConfig as Record<string, unknown>).WIND_PARTICLE_COLORS).toBeUndefined();
    expect((earthConfig as Record<string, unknown>).GRAY_COLORS).toBeUndefined();
  });
});
