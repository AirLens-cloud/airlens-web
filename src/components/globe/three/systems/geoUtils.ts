/**
 * geoUtils — geographic coordinate ↔ Three.js Vector3 conversion utilities.
 *
 * All rendering constants come from GLOBE_CONFIG (no hardcoding).
 */
import * as THREE from 'three';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';

const { AQ_SPIKES } = GLOBE_CONFIG;

export const GLOBE_R = 1.005;

/** Convert lat/lon (degrees) to a Three.js Vector3 on a sphere of given radius. */
export function latLonToVec3(
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** Inverse of latLonToVec3 — sphere-surface Vector3 → lat/lon (degrees). */
export function vec3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const r = v.length();
  if (r === 0) return { lat: 0, lon: 0 };
  const phi = Math.acos(THREE.MathUtils.clamp(v.y / r, -1, 1));
  const lat = 90 - THREE.MathUtils.radToDeg(phi);
  const theta = Math.atan2(v.z, -v.x);
  let lon = THREE.MathUtils.radToDeg(theta) - 180;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  return { lat, lon };
}

/** Return the surface-normal quaternion so a spike stands upright at lat/lon. */
export function latLonToQuaternion(lat: number, lon: number): THREE.Quaternion {
  const position = latLonToVec3(lat, lon, 1);
  const up = position.clone().normalize();
  const m = new THREE.Matrix4().lookAt(
    new THREE.Vector3(0, 0, 0),
    up,
    new THREE.Vector3(0, 1, 0),
  );
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** Map PM2.5 value to spike height using config exponent. */
export function getSpikeHeight(pm25: number): number {
  const clamped = Math.min(Math.max(pm25, 0), AQ_SPIKES.PM25_MAX);
  const ratio = clamped / AQ_SPIKES.PM25_MAX;
  const eased = Math.pow(ratio, AQ_SPIKES.HEIGHT_EXPONENT);
  return AQ_SPIKES.MIN_HEIGHT + eased * (AQ_SPIKES.MAX_HEIGHT - AQ_SPIKES.MIN_HEIGHT);
}

/** Map PM2.5 value to WHO AQI 6-level color. */
export function getAQIColor(pm25: number): THREE.Color {
  const t = AQ_SPIKES.THRESHOLDS;
  const c = AQ_SPIKES.COLORS;

  if (pm25 <= t.GOOD) return new THREE.Color(c.GOOD);
  if (pm25 <= t.MODERATE) return new THREE.Color(c.MODERATE);
  if (pm25 <= t.USG) return new THREE.Color(c.USG);
  if (pm25 <= t.UNHEALTHY) return new THREE.Color(c.UNHEALTHY);
  if (pm25 <= t.VERY_UNHEALTHY) return new THREE.Color(c.VERY_UNHEALTHY);
  return new THREE.Color(c.HAZARDOUS);
}
