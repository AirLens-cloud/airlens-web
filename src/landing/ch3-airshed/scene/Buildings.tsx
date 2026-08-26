// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/seoul/scene/Buildings.tsx` (Wave L3, 2026-08-26); `theme/config`
// import rebound to this chapter's local `../theme`, `perf/types` rebound to
// `../../shared/perf/types`.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { DistrictInfo } from '../types'
import type { QualityTier } from '../../shared/perf/types'
import { SEOUL } from '../theme'
import { mulberry32 } from '../projection'

// Procedural massing, not a real building dataset — this scatters boxes near
// each district centroid, seeded from the district code (mulberry32, never
// Math.random) so the layout is identical on every load. Deliberately grey and
// uniform: the color channel is reserved for PM2.5 on the district slabs, so
// these must read as generic city fabric, not as a second data signal.
const PER_TIER: Record<QualityTier, number> = { high: 14, medium: 10, low: 6 }

interface Instance {
  x: number
  y: number
  z: number
  w: number
  h: number
}

function buildingsForDistrict(d: DistrictInfo, count: number): Instance[] {
  const rng = mulberry32(d.seed)
  const [cx, cz] = d.localCentroid
  const out: Instance[] = []
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2
    const radius = 0.3 + rng() * 1.1 // km — scatter radius around the centroid
    const w = 0.08 + rng() * 0.16
    const h = 0.03 + rng() * 0.13
    out.push({
      x: cx + Math.cos(angle) * radius,
      z: cz + Math.sin(angle) * radius,
      y: h / 2,
      w,
      h,
    })
  }
  return out
}

export default function Buildings({ districts, tier }: { districts: DistrictInfo[]; tier: QualityTier }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const perDistrict = PER_TIER[tier]

  const instances = useMemo(
    () => districts.flatMap((d) => buildingsForDistrict(d, perDistrict)),
    [districts, perDistrict],
  )

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < instances.length; i++) {
      const b = instances[i]
      dummy.position.set(b.x, b.y, b.z)
      dummy.scale.set(b.w, b.h, b.w)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [instances, dummy])

  if (instances.length === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, instances.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={SEOUL.hair} roughness={0.9} metalness={0} />
    </instancedMesh>
  )
}
