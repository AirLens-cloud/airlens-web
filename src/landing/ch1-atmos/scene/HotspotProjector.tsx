// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/scene/HotspotProjector.tsx` (Wave L1, 2026-08-26) — no
// path changes needed (only imports `../globeCoords` and `../types`, same
// relative depth in both repos).
//
// `react-hooks/immutability` is disabled file-wide: `out` is a preallocated
// array (via `useMemo`) that `useFrame` mutates in place every frame on
// purpose, so no per-frame array is thrown away just to hand the projector's
// caller a "new" object — the same r3f imperative-mutation pattern explained
// in WindParticles.tsx.
/* eslint-disable react-hooks/immutability */
import { useMemo, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HOTSPOTS, latLonToGlobe } from '../globeCoords'
import type { HotspotScreen } from '../types'

interface Props {
  groupRef: MutableRefObject<THREE.Group | null>
  screenRef: MutableRefObject<HotspotScreen[]>
  values: number[] // live µg/m³ sampled from the grid
}

export default function HotspotProjector({ groupRef, screenRef, values }: Props) {
  // All buffers preallocated — the frame loop mutates in place, no per-frame alloc.
  // Match the marker ring radius (1.012) so the projected leader dot lands on the ring center.
  const local = useMemo(() => HOTSPOTS.map((h) => new THREE.Vector3(...latLonToGlobe(h.lat, h.lon, 1.012))), [])
  const world = useMemo(() => new THREE.Vector3(), [])
  const ndc = useMemo(() => new THREE.Vector3(), [])
  const camPos = useMemo(() => new THREE.Vector3(), [])
  const out = useMemo<HotspotScreen[]>(
    () => HOTSPOTS.map((h) => ({ name: h.name, pm25: 0, x: 0, y: 0, front: false })),
    [],
  )

  useFrame((state) => {
    const g = groupRef.current
    if (!g) return
    const cam = state.camera
    camPos.setFromMatrixPosition(cam.matrixWorld)
    for (let i = 0; i < local.length; i++) {
      world.copy(local[i]).applyMatrix4(g.matrixWorld)
      // Near side: surface normal (== normalized world pos) points toward camera.
      const nlen = Math.hypot(world.x, world.y, world.z) || 1
      const cx = camPos.x - world.x
      const cy = camPos.y - world.y
      const cz = camPos.z - world.z
      const clen = Math.hypot(cx, cy, cz) || 1
      const dot = (world.x * cx + world.y * cy + world.z * cz) / (nlen * clen)
      ndc.copy(world).project(cam)
      const o = out[i]
      o.pm25 = values[i] ?? 0
      o.x = ndc.x * 0.5 + 0.5
      o.y = -ndc.y * 0.5 + 0.5
      o.front = dot > 0.1
    }
    screenRef.current = out
  })

  return null
}
