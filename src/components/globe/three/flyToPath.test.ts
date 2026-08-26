/**
 * flyToPath — easing + great-circle slerp path tests (AAA).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { easeInOutCubic, flyToPose } from './flyToPath';

const ARC = 2.4;
const out = new THREE.Vector3();

describe('easeInOutCubic', () => {
  it('pins endpoints and midpoint', () => {
    // Arrange / Act / Assert
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
  });

  it('clamps out-of-range input to [0,1]', () => {
    expect(easeInOutCubic(-2)).toBe(0);
    expect(easeInOutCubic(5)).toBe(1);
  });

  it('is symmetric about 0.5', () => {
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 6);
  });
});

describe('flyToPose great-circle path', () => {
  it('returns exact start position at t=0', () => {
    // Arrange
    const from = new THREE.Vector3(1.8, 0, 0);
    const to = new THREE.Vector3(0, 1.8, 0);
    // Act
    flyToPose(from, to, 0, ARC, out);
    // Assert
    expect(out.distanceTo(from)).toBeLessThan(1e-9);
  });

  it('returns exact end position at t=1', () => {
    const from = new THREE.Vector3(1.8, 0, 0);
    const to = new THREE.Vector3(0, 1.8, 0);
    flyToPose(from, to, 1, ARC, out);
    expect(out.distanceTo(to)).toBeLessThan(1e-9);
  });

  it('keeps the midpoint on the sphere direction (great circle), not the chord', () => {
    // Arrange — two points 90° apart at equal radius.
    const from = new THREE.Vector3(1.8, 0, 0);
    const to = new THREE.Vector3(0, 1.8, 0);
    // Act
    flyToPose(from, to, 0.5, 1.8, out); // arc == radius → no bulge, pure slerp
    // Assert — direction bisects the two (45°), radius preserved (no dip).
    expect(out.length()).toBeCloseTo(1.8, 6);
    const dir = out.clone().normalize();
    expect(dir.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(dir.y).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('never dips below the smaller endpoint radius mid-path', () => {
    // A straight lerp between these would shrink the camera radius at the
    // midpoint (chord passes nearer origin) — slerp must not.
    const from = new THREE.Vector3(1.8, 0, 0);
    const to = new THREE.Vector3(-1.8, 0.01, 0); // near-antipodal
    for (let i = 1; i < 10; i++) {
      flyToPose(from, to, i / 10, 1.8, out);
      expect(out.length()).toBeGreaterThanOrEqual(1.8 - 1e-6);
    }
  });

  it('bulges toward arcRadius at the midpoint when arc > endpoint radii', () => {
    const from = new THREE.Vector3(1.8, 0, 0);
    const to = new THREE.Vector3(0, 1.8, 0);
    flyToPose(from, to, 0.5, 2.4, out);
    // Peak bump = (2.4 - 1.8) * sin(pi/2) = 0.6 → radius 2.4 at mid.
    expect(out.length()).toBeCloseTo(2.4, 6);
  });

  it('interpolates radius when endpoints differ (zoom in)', () => {
    const from = new THREE.Vector3(3.0, 0, 0); // pushed-back (intro)
    const to = new THREE.Vector3(1.8, 0, 0);   // arrival, same direction
    flyToPose(from, to, 1, 1.8, out);
    expect(out.length()).toBeCloseTo(1.8, 6);
    flyToPose(from, to, 0, 1.8, out);
    expect(out.length()).toBeCloseTo(3.0, 6);
  });

  it('handles the antipodal singularity without NaN', () => {
    // Exactly opposite directions — setFromUnitVectors must pick a perp axis.
    const from = new THREE.Vector3(1.8, 0, 0);
    const to = new THREE.Vector3(-1.8, 0, 0);
    flyToPose(from, to, 0.5, 1.8, out);
    expect(Number.isNaN(out.x)).toBe(false);
    expect(Number.isNaN(out.y)).toBe(false);
    expect(Number.isNaN(out.z)).toBe(false);
    expect(out.length()).toBeCloseTo(1.8, 5); // stays on the sphere
  });

  it('snaps to target for degenerate (origin) start', () => {
    const from = new THREE.Vector3(0, 0, 0);
    const to = new THREE.Vector3(1.8, 0, 0);
    flyToPose(from, to, 0.5, 1.8, out);
    expect(out.distanceTo(to)).toBeLessThan(1e-9);
  });
});
