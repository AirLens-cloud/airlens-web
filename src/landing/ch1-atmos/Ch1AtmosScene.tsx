/**
 * Ch1AtmosScene — the lazy-loaded module behind Chapter 1's canvas slot.
 * Adapted from AirLens-platform apps/landing-lab `src/concepts/atmos/AtmosPage.tsx`
 * (Wave L1, 2026-08-26): the source page owned its own `<SiteNav>` + whole-document
 * scroll progress (`useScrollProgress`) and rendered unconditionally once data
 * was ready. Here `progress`/`progressRef` arrive as props from
 * `useChapterProgress` (chapter-scoped, not page-scoped — see `scene/CameraRig.tsx`),
 * `<SiteNav>` is dropped (this chapter mounts inside the bigger flight page, which
 * owns its own chrome), and two additional guards run before the scene mounts:
 *
 *  - No WebGL: render `GlobeFallback` (2D SVG) instead of a black hole where a
 *    <Canvas> would silently fail to paint.
 *  - Data fetch failed: render `WfDataState` instead of the source's bespoke
 *    `<ErrorPanel>` — same "never a fabricated globe" principle, this repo's
 *    shared data-state vocabulary instead of a one-off component.
 */
import { useRef, useState, type MutableRefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { useQuality } from '../shared/perf/QualityProvider'
import WfPlaceholder from '../../components/wireframe/WfPlaceholder'
import WfDataState from '../../components/wireframe/WfDataState'
import GlobeFallback from '../../components/globe/GlobeFallback'
import { dataState } from '../../types/dataState'
import { useAtmosData } from './useAtmosData'
import AtmosScene from './scene/AtmosScene'
import type { HotspotScreen } from './types'
import Sections from './sections/Sections'
import HotspotLeaders from './sections/HotspotLeaders'
import './ch1-atmos.css'

function supportsWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export interface Ch1AtmosSceneProps {
  /** rAF-throttled chapter progress (0..1) — drives the HTML narrative overlay. */
  progress: number
  /** Always-current chapter progress ref — read by the r3f camera rig without re-rendering. */
  progressRef: MutableRefObject<number>
}

export default function Ch1AtmosScene({ progress, progressRef }: Ch1AtmosSceneProps) {
  const { tier } = useQuality()
  const lod: 'low' | 'medium' = tier === 'low' ? 'low' : 'medium'
  const state = useAtmosData(lod)
  const screenRef = useRef<HotspotScreen[]>([])
  const [webgl] = useState(() => supportsWebGL())

  if (!webgl) {
    return (
      <div className="ch1-atmos-stage ch1-atmos-stage--fallback">
        <GlobeFallback message="This device can't render the 3D atmosphere — showing a static globe instead." />
      </div>
    )
  }

  if (state.status === 'error') {
    // Never a fabricated globe: the real reason lives in state.error (logged
    // for debugging); the honest, shared "no data" panel is what renders.
    console.error('[ch1-atmos] data load failed:', state.error)
    return (
      <div className="ch1-atmos-stage ch1-atmos-stage--fallback">
        <WfDataState state={dataState('error', { source: 'landing mirror snapshot' })} />
      </div>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="ch1-atmos-stage ch1-atmos-stage--fallback">
        <WfPlaceholder label="Loading the atmosphere…" />
      </div>
    )
  }

  return (
    <div className="ch1-atmos-stage">
      <Canvas
        className="ch1-atmos-canvas"
        camera={{ position: [0, 0, 3.4], fov: 45 }}
        dpr={[1, tier === 'low' ? 1.2 : 2]}
        gl={{ antialias: tier !== 'low', alpha: false }}
      >
        <AtmosScene data={state.data} tier={tier} progressRef={progressRef} screenRef={screenRef} />
      </Canvas>
      <Sections progress={progress} data={state.data} tier={tier} />
      <HotspotLeaders screenRef={screenRef} progressRef={progressRef} />
    </div>
  )
}
