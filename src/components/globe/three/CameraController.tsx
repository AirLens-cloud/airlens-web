/**
 * CameraController — smooth FlyTo when a country is selected, plus a
 * one-time entry cinematic (arcs in from a pushed-back distance on mount).
 *
 * Fly-to is progress-based: easeInOutCubic over FLYTO.DURATION_S, with the
 * camera direction slerped along a great circle (flyToPath) so long moves keep
 * a constant altitude instead of dipping toward the globe. OrbitControls stay
 * disabled during the animation, then re-enable with synced internal state.
 */
import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { useGlobeStore } from '../../../store/globeStore';
import { GLOBE_CONFIG } from '../../../lib/config/globe';
import { orbitControlsRef } from './Globe3DScene';
import { flyToPose } from './flyToPath';

const DEG2RAD = Math.PI / 180;
const { FLYTO } = GLOBE_CONFIG.GLOBE_THEME;

function latLonToPosition(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const CameraController = () => {
  const selectedCountry = useGlobeStore((s) => s.selectedCountry);
  const flyToTarget = useGlobeStore((s) => s.flyToTarget);
  const setFlyToTarget = useGlobeStore((s) => s.setFlyToTarget);
  const { camera } = useThree();
  const targetCamPos = useRef<THREE.Vector3 | null>(null);
  // Progress-based fly-to state — start pose captured when the move begins.
  const flyStart = useRef(new THREE.Vector3());
  const flyElapsed = useRef(0);
  const flyDuration = useRef<number>(FLYTO.DURATION_S);
  const animating = useRef(false);
  const prevCode = useRef<string | null>(null);
  // Guards the one-shot setFlyToTarget(null) consumption on arrival — only the
  // flyToTarget effect below sets this true, so selectedCountry-driven arrivals
  // never touch flyToTarget.
  const flyToPending = useRef(false);
  // Guards the one-shot autoRotate restoration on intro arrival, and prevents
  // the intro from replaying if this component re-renders after mount.
  const introPending = useRef(false);
  const introPlayed = useRef(false);

  // Begin a progress-based fly-to from the current camera pose to `pos`.
  // Re-basing from camera.position mid-flight naturally cancels+restarts the
  // move toward a new target (interrupt handling).
  const startFlyTo = useCallback(
    (pos: THREE.Vector3, reducedSnap: boolean) => {
      flyStart.current.copy(camera.position);
      flyElapsed.current = 0;
      flyDuration.current = reducedSnap ? 0 : FLYTO.DURATION_S;
      targetCamPos.current = pos;
      animating.current = true;
    },
    [camera],
  );

  // React to country selection changes
  useEffect(() => {
    const code = selectedCountry?.code ?? null;
    if (code === prevCode.current) return;
    prevCode.current = code;

    const controls = orbitControlsRef.current;

    if (selectedCountry) {
      // Disable OrbitControls during FlyTo (also blocks drag mid-flight).
      if (controls) {
        controls.enabled = false;
        controls.autoRotate = false;
      }

      const pos = latLonToPosition(selectedCountry.lat, selectedCountry.lon, FLYTO.ZOOM_DISTANCE);
      startFlyTo(pos, prefersReducedMotion());
    } else {
      // Deselect — re-enable OrbitControls
      animating.current = false;
      targetCamPos.current = null;

      if (controls) {
        // Sync OrbitControls target to origin and update internal state
        controls.target.set(0, 0, 0);
        controls.update();
        controls.enabled = true;
        controls.autoRotate = true;
      }
    }
  }, [selectedCountry, camera, startFlyTo]);

  // React to search-result / shared-URL fly-to requests — same FlyTo mechanism
  // as country selection, consumed once (setFlyToTarget(null)) on arrival below.
  useEffect(() => {
    if (!flyToTarget) return;

    const controls = orbitControlsRef.current;
    if (controls) {
      controls.enabled = false;
      controls.autoRotate = false;
    }

    const pos = latLonToPosition(flyToTarget.lat, flyToTarget.lon, flyToTarget.distance ?? FLYTO.ZOOM_DISTANCE);
    startFlyTo(pos, prefersReducedMotion());
    flyToPending.current = true;
  }, [flyToTarget, startFlyTo]);

  // One-time entry cinematic — arcs in from a pushed-back distance on mount.
  // Skipped for prefers-reduced-motion and when a shared-URL fly-to is already
  // pending (that flyToTarget effect above takes precedence).
  useEffect(() => {
    if (introPlayed.current) return;
    introPlayed.current = true;

    if (prefersReducedMotion()) return;
    if (flyToTarget) return;

    const original = camera.position.clone();
    camera.position.copy(original).multiplyScalar(FLYTO.INTRO_PUSHBACK_MULTIPLIER);
    camera.lookAt(0, 0, 0);

    const controls = orbitControlsRef.current;
    if (controls) {
      controls.enabled = false;
      controls.autoRotate = false;
    }

    startFlyTo(original, false);
    introPending.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only intro, reads flyToTarget/camera via closure at mount
  }, []);

  useFrame((_, delta) => {
    if (!animating.current || !targetCamPos.current) return;

    const dur = flyDuration.current;
    flyElapsed.current += delta;
    const t = dur <= 0 ? 1 : Math.min(flyElapsed.current / dur, 1);

    // Great-circle slerp path; write straight into camera.position (no alloc).
    flyToPose(flyStart.current, targetCamPos.current, t, FLYTO.ARC_RADIUS, camera.position);
    if (t >= 1) {
      // Snap exact to target (float-safe) before the final lookAt.
      camera.position.copy(targetCamPos.current);
    }
    camera.lookAt(0, 0, 0);

    if (t >= 1) {
      animating.current = false;
      targetCamPos.current = null;

      // Re-enable OrbitControls at final position (no autoRotate while country selected)
      const controls = orbitControlsRef.current;
      if (controls) {
        controls.target.set(0, 0, 0);
        controls.update();
        controls.enabled = true;
        // Restore autoRotate only for the intro arrival — a search fly-to that
        // lands mid-intro expects the globe to stay put (introPending may still
        // be true if the intro was superseded, so exclude that case).
        if (introPending.current && !flyToPending.current) {
          controls.autoRotate = true;
        }
      }

      if (introPending.current) {
        introPending.current = false;
      }

      if (flyToPending.current) {
        flyToPending.current = false;
        setFlyToTarget(null);
      }
    }
  });

  return null;
};

export default CameraController;
