// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/scene/AtmosScene.tsx` (Wave L1, 2026-08-26); theme/perf
// imports rebound to the chapter-local theme module and `shared/perf`.
import { useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import type { AtmosData, HotspotScreen } from '../types'
import type { QualityTier } from '../../shared/perf/types'
import { ATMOS } from '../theme'
import { HOTSPOTS } from '../globeCoords'
import EarthPoints from './EarthPoints'
import Atmosphere from './Atmosphere'
import Stars from './Stars'
import WindParticles from './WindParticles'
import Fires from './Fires'
import CoastLines from './CoastLines'
import HotspotMarkers from './HotspotMarkers'
import HotspotProjector from './HotspotProjector'
import CameraRig from './CameraRig'

interface Props {
  data: AtmosData
  tier: QualityTier
  progressRef: MutableRefObject<number>
  screenRef: MutableRefObject<HotspotScreen[]>
}

export default function AtmosScene({ data, tier, progressRef, screenRef }: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const pmRef = useRef(0)
  const windRef = useRef(0)
  const introRef = useRef(0) // 0→1 first-impression ramp (points + rim), driven by CameraRig

  // Hotspot µg/m³ sampled live from the loaded grid — never hardcoded.
  const hotspotValues = useMemo(
    () => HOTSPOTS.map((h) => data.pm25.sampleAt(h.lat, h.lon)),
    [data.pm25],
  )

  const windCount = tier === 'high' ? 4000 : tier === 'medium' ? 2500 : 1200
  const starCount = tier === 'low' ? 800 : tier === 'high' ? 2000 : 1500
  const pointSize = tier === 'low' ? 3.0 : 2.4

  return (
    <>
      <color attach="background" args={[ATMOS.bg]} />
      <Stars count={starCount} />
      <group ref={groupRef}>
        <Atmosphere introRef={introRef} />
        <CoastLines topo={data.topo} />
        <EarthPoints points={data.points} pm25={data.pm25} pmStrengthRef={pmRef} introRef={introRef} size={pointSize} />
        <WindParticles wind={data.wind} count={windCount} strengthRef={windRef} />
        <Fires fires={data.fires} />
        <HotspotMarkers strengthRef={pmRef} screenRef={screenRef} />
      </group>
      <HotspotProjector groupRef={groupRef} screenRef={screenRef} values={hotspotValues} />
      <CameraRig groupRef={groupRef} progressRef={progressRef} pmRef={pmRef} windRef={windRef} introRef={introRef} />
    </>
  )
}
