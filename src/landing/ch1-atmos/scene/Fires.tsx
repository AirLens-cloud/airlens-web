// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/scene/Fires.tsx` (Wave L1, 2026-08-26); data/perf/theme
// imports rebound to `shared/data`/`shared/perf`/`shared/theme/config`.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FiresData } from '../../shared/data/loaders'
import { useReducedMotion } from '../../shared/perf/useReducedMotion'
import { AQI_GRADE_HEX } from '../../shared/theme/config'
import { latLonToGlobe } from '../globeCoords'

const R = 1.035

// Instanced pulsing markers for active fire detections. The mirror snapshot
// currently carries zero rows, so this renders nothing — the HUD states that
// honestly. The code path stays implemented for when FIRMS reports active fires.
export default function Fires({ fires }: { fires: FiresData }) {
  const reduced = useReducedMotion()
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const rows = fires.rows

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const positions = useMemo(
    () => rows.map((r) => latLonToGlobe(r[0], r[1], R)),
    [rows],
  )

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh || rows.length === 0) return
    const pulse = reduced ? 1 : 0.8 + 0.4 * Math.sin(state.clock.elapsedTime * 3)
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]
      dummy.position.set(p[0], p[1], p[2])
      dummy.scale.setScalar(0.01 * pulse)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  if (rows.length === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, rows.length]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={AQI_GRADE_HEX.UNHEALTHY} transparent opacity={0.9} />
    </instancedMesh>
  )
}
