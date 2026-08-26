// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/seoul/scene/Districts.tsx` (Wave L3, 2026-08-26); `theme/config`
// import rebound to this chapter's local `../theme`, same seam Ch1's
// `AtmosScene.tsx` and Ch2's `FlowField.tsx` use.
import { useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { DistrictInfo } from '../types'
import { SEOUL } from '../theme'

// One extruded mesh per district. Height and fill color are both direct reads
// of that district centroid's live PM2.5 sample (see useSeoulData / projection
// pmToColor/pmToHeight) — nothing here is a fabricated or hand-tuned value.
// A district's polygon may be a MultiPolygon (a couple of outlying wards are),
// so each mesh can carry more than one THREE.Shape.
function buildGeometry(d: DistrictInfo): THREE.ExtrudeGeometry {
  const shapes = d.ringsLocal.map((ring) => {
    const shape = new THREE.Shape()
    ring.forEach(([x, z], i) => {
      // Vector2(x, -z): compensates the -90° X rotation applied below to the mesh,
      // so the extrusion's local +Z (depth) lands on world +Y (up) and local Y
      // lands back on world +Z (a district's polygon should not come out mirrored).
      if (i === 0) shape.moveTo(x, -z)
      else shape.lineTo(x, -z)
    })
    return shape
  })
  return new THREE.ExtrudeGeometry(shapes, { depth: d.height, bevelEnabled: false, steps: 1 })
}

interface Props {
  districts: DistrictInfo[]
  hoveredCode: string | null
  selectedCode: string | null
  onHover: (code: string | null) => void
  onSelect: (code: string) => void
}

function District({
  d,
  active,
  onHover,
  onSelect,
}: {
  d: DistrictInfo
  active: boolean
  onHover: (code: string | null) => void
  onSelect: (code: string) => void
}) {
  const geometry = useMemo(() => buildGeometry(d), [d])
  const color = useMemo(() => new THREE.Color(d.colorHex), [d.colorHex])
  const emissive = useMemo(() => new THREE.Color(SEOUL.accent), [])

  return (
    <mesh
      geometry={geometry}
      rotation-x={-Math.PI / 2}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        onHover(d.code)
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        onHover(null)
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onSelect(d.code)
      }}
    >
      <meshStandardMaterial
        color={color}
        emissive={active ? emissive : '#000000'}
        emissiveIntensity={active ? 0.35 : 0}
        roughness={0.75}
        metalness={0.05}
      />
    </mesh>
  )
}

export default function Districts({ districts, hoveredCode, selectedCode, onHover, onSelect }: Props) {
  return (
    <group>
      {districts.map((d) => (
        <District
          key={d.code}
          d={d}
          active={d.code === hoveredCode || d.code === selectedCode}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}
