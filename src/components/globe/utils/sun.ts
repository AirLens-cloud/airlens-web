import * as THREE from 'three';

/** Compute a unit vector pointing toward the Sun based on the given UTC time (defaults to now). */
export const getSunDirection = (date: Date = new Date()): THREE.Vector3 => {
  const now     = date;
  const hours   = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const startY  = new Date(Date.UTC(now.getUTCFullYear(), 0, 0));
  const doy     = Math.floor((now.getTime() - startY.getTime()) / 86_400_000);
  const decl    = (23.45 * Math.PI / 180) * Math.sin((2 * Math.PI / 365) * (doy - 81));
  const hourAng = ((hours - 12) / 24) * Math.PI * 2;
  return new THREE.Vector3(
    Math.cos(decl) * Math.cos(hourAng),
    Math.sin(decl),
    Math.cos(decl) * Math.sin(hourAng),
  ).normalize();
};
