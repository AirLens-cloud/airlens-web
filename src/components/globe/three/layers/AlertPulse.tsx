/**
 * AlertPulse — WHO threshold warning rings around high-PM2.5 stations.
 *
 * Renders pulsing rings at stations where PM2.5 exceeds UNHEALTHY (150+).
 * Uses GLOBE_CONFIG.ALERT_PULSE for all animation constants.
 */
import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGlobeMarkers } from '../../../../hooks/useGlobeData';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';
import { aqiToPm25 } from '../../../../lib/config/aqi';
import { latLonToVec3, latLonToQuaternion, GLOBE_R } from '../systems/geoUtils';

const PULSE = GLOBE_CONFIG.ALERT_PULSE;
const AQ = GLOBE_CONFIG.AQ_SPIKES;

interface AlertStation {
  lat: number;
  lon: number;
  pm25: number;
}

const AlertPulse = () => {
  const groupRef = useRef<THREE.Group>(null);
  const rawMarkers = useGlobeMarkers();
  const stations = useMemo(() => {
    const alerts: AlertStation[] = [];
    for (const item of rawMarkers) {
      const m = item as Record<string, unknown>;
      const loc = m.location as { lat?: number; lon?: number } | undefined;
      if (!loc?.lat || !loc?.lon) continue;
      const aqi = typeof m.aqi === 'number' ? m.aqi : 0;
      const pm25 = aqiToPm25(aqi);
      if (pm25 >= AQ.THRESHOLDS.UNHEALTHY) {
        alerts.push({ lat: loc.lat, lon: loc.lon, pm25 });
      }
    }
    return alerts;
  }, [rawMarkers]);

  const ringGeo = useMemo(
    () => new THREE.RingGeometry(PULSE.RING_INNER, PULSE.RING_OUTER, 32),
    [],
  );

  // Animate pulse
  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.getElapsedTime();

    group.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      const pulse = Math.sin(t * PULSE.PULSE_SPEED) * 0.5 + 0.5;
      const scale = 1 + pulse * (PULSE.MAX_SCALE - 1);
      mesh.scale.setScalar(scale);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = PULSE.ALPHA_BASE * (1 - pulse * 0.5);
    });
  });

  if (stations.length === 0) return null;

  return (
    <group ref={groupRef}>
      {stations.map((s) => {
        const pos = latLonToVec3(s.lat, s.lon, GLOBE_R + 0.001);
        const quat = latLonToQuaternion(s.lat, s.lon);
        return (
          <mesh
            key={`alert-${s.lat}-${s.lon}`}
            position={pos}
            quaternion={quat}
            geometry={ringGeo}
          >
            <meshBasicMaterial
              color={PULSE.COLOR}
              transparent
              opacity={PULSE.ALPHA_BASE}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
};

export default AlertPulse;
