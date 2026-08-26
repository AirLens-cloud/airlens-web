// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/seoul/scene/SeoulScene.tsx` (Wave L3, 2026-08-26); `theme/config`
// and `perf/types` imports rebound to this chapter's local `../theme` and
// `../../shared/perf/types`, same seam every other Wave L3 scene file uses.
import { useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { SeoulData } from '../types'
import type { QualityTier } from '../../shared/perf/types'
import { SEOUL } from '../theme'
import Districts from './Districts'
import Buildings from './Buildings'
import Haze from './Haze'
import WindStreaks from './WindStreaks'
import CameraRig from './CameraRig'

interface Props {
  data: SeoulData
  tier: QualityTier
  progressRef: MutableRefObject<number>
  hoveredCode: string | null
  selectedCode: string | null
  onHover: (code: string | null) => void
  onSelect: (code: string) => void
}

const WIND_COUNTS: Record<QualityTier, number> = { high: 700, medium: 450, low: 220 }

/** Fades the wind-streak layer in once the scroll passes the hero (S0 → S1). */
function WindReveal({ progressRef, strengthRef }: { progressRef: MutableRefObject<number>; strengthRef: MutableRefObject<number> }) {
  useFrame((_, dt) => {
    const target = Math.min(1, Math.max(0, (progressRef.current - 0.06) / 0.2))
    strengthRef.current += (target - strengthRef.current) * Math.min(1, dt * 3)
  })
  return null
}

export default function SeoulScene({ data, tier, progressRef, hoveredCode, selectedCode, onHover, onSelect }: Props) {
  const windRef = useRef(0)
  const count = WIND_COUNTS[tier]

  return (
    <>
      <color attach="background" args={[SEOUL.bg]} />
      <fog attach="fog" args={[SEOUL.bg, 30, 70]} />
      <ambientLight intensity={0.55} color={SEOUL.ink} />
      <directionalLight position={[-10, 22, 14]} intensity={1.1} color={SEOUL.ink} />
      <directionalLight position={[12, 8, -10]} intensity={0.35} color={SEOUL.accent} />

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow={false}>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial color={SEOUL.panel} roughness={1} />
      </mesh>

      <Districts
        districts={data.districts}
        hoveredCode={hoveredCode}
        selectedCode={selectedCode}
        onHover={onHover}
        onSelect={onSelect}
      />
      <Buildings districts={data.districts} tier={tier} />
      <Haze meanPm25={data.meanPm25} />
      <WindStreaks wind={data.wind} count={count} strengthRef={windRef} />

      <WindReveal progressRef={progressRef} strengthRef={windRef} />
      <CameraRig progressRef={progressRef} />
    </>
  )
}
