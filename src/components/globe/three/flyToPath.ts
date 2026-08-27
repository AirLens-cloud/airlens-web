/**
 * flyToPath — pure camera fly-to path math.
 *
 * Great-circle interpolation: camera direction slerps between start and end
 * (constant-radius arc on the sphere, no straight-line shortcut that dips the
 * camera toward the globe on long moves), radius eases start→end with a
 * mid-path bulge toward a peak radius. No allocation — reuses module scratch.
 */
import * as THREE from 'three';

/** easeInOutCubic on [0,1] (input clamped). Smooth accel then decel. */
export function easeInOutCubic(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

// Module-scope scratch — reused across calls (no per-frame allocation).
const _startDir = new THREE.Vector3();
const _endDir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _identity = new THREE.Quaternion(); // kept identity — slerp source

/**
 * Camera pose along a great-circle fly-to path. Writes into `out`.
 *
 * @param from       start camera position (origin-relative)
 * @param to         end camera position (origin-relative)
 * @param t          raw progress in [0,1] (eased internally)
 * @param arcRadius  radius the mid-path bulges toward — peak = max(from,to,arc)
 * @param out        output vector, mutated and returned
 */
export function flyToPose(
  from: THREE.Vector3,
  to: THREE.Vector3,
  t: number,
  arcRadius: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const e = easeInOutCubic(t);
  const startRadius = from.length();
  const endRadius = to.length();

  // Degenerate input (camera at origin) — nothing to slerp, snap to target.
  if (startRadius < 1e-9 || endRadius < 1e-9) {
    return out.copy(to);
  }

  _startDir.copy(from).divideScalar(startRadius);
  _endDir.copy(to).divideScalar(endRadius);

  // Direction slerp. setFromUnitVectors picks a valid perpendicular axis for the
  // antipodal case (opposite directions), so the path stays on a great circle.
  _q.setFromUnitVectors(_startDir, _endDir);
  _qt.copy(_identity).slerp(_q, e);
  out.copy(_startDir).applyQuaternion(_qt); // interpolated unit direction

  // Radius — eased lerp start→end + sin bulge toward peak (0 at both ends).
  const baseRadius = startRadius + (endRadius - startRadius) * e;
  const peakRadius = Math.max(startRadius, endRadius, arcRadius);
  const bump = (peakRadius - Math.max(startRadius, endRadius)) * Math.sin(Math.PI * e);
  return out.multiplyScalar(baseRadius + bump);
}
