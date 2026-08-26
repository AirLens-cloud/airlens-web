// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/scene/CoastLines.tsx` (Wave L1, 2026-08-26); theme
// import rebound to the chapter-local theme module.
import { useMemo } from 'react'
import * as THREE from 'three'
import { coastlineSegments } from '../topo'
import { ATMOS } from '../theme'

// Faint coastline structure so the dark point cloud reads as continents, not a
// black disc. Coarse 110m outline, thin single line, low opacity — never fat.
export default function CoastLines({ topo }: { topo: unknown }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(coastlineSegments(topo), 3))
    return g
  }, [topo])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={ATMOS.hud} transparent opacity={0.16} depthWrite={false} />
    </lineSegments>
  )
}
