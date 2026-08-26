// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/scene/HotspotMarkers.tsx` (Wave L1, 2026-08-26); perf/theme
// imports rebound to `shared/perf`/`shared/theme/config`.
import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HOTSPOTS, latLonToGlobe } from '../globeCoords'
import type { HotspotScreen } from '../types'
import { useReducedMotion } from '../../shared/perf/useReducedMotion'
import { AQI_GRADE_HEX } from '../../shared/theme/config'

const UP = new THREE.Vector3(0, 0, 1)

// Small rings sitting on the globe at each callout city, tangent to the surface.
// They fade in with the pollution reveal (shared pmRef) and are culled to the near
// hemisphere using the SAME `front` flag the HTML leaders read (screenRef), so a
// ring and its label always appear/disappear together. Pulse animates ring size
// only (per-mesh scale) — never position — and is disabled under reduced-motion.
export default function HotspotMarkers({
  strengthRef,
  screenRef,
}: {
  strengthRef: MutableRefObject<number>
  screenRef: MutableRefObject<HotspotScreen[]>
}) {
  const reduced = useReducedMotion()
  const meshes = useRef<Array<THREE.Mesh | null>>([])
  const mats = useRef<THREE.Material[]>([])

  const markers = useMemo(
    () =>
      HOTSPOTS.map((h) => {
        const p = latLonToGlobe(h.lat, h.lon, 1.012)
        const pos = new THREE.Vector3(p[0], p[1], p[2])
        const quat = new THREE.Quaternion().setFromUnitVectors(UP, pos.clone().normalize())
        return { pos, quat }
      }),
    [],
  )

  useFrame((state) => {
    const s = strengthRef.current
    const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(state.clock.elapsedTime * 2.2)
    const fronts = screenRef.current
    for (let i = 0; i < meshes.current.length; i++) {
      const mesh = meshes.current[i]
      if (mesh) mesh.scale.setScalar(pulse)
      const m = mats.current[i] as THREE.MeshBasicMaterial | undefined
      if (m) m.opacity = fronts[i]?.front ? s * 0.9 : 0
    }
  })

  return (
    <group>
      {markers.map((m, i) => (
        <mesh
          key={i}
          position={m.pos}
          quaternion={m.quat}
          ref={(r) => {
            meshes.current[i] = r
          }}
        >
          <ringGeometry args={[0.022, 0.03, 32]} />
          <meshBasicMaterial
            ref={(r) => {
              if (r) mats.current[i] = r
            }}
            color={AQI_GRADE_HEX.UNHEALTHY}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}
