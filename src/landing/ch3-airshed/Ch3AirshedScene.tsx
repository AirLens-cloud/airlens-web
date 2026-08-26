/**
 * Ch3AirshedScene — the lazy-loaded module behind Chapter 3's canvas slot.
 * Adapted from AirLens-platform apps/landing-lab `src/concepts/seoul/SeoulPage.tsx`
 * (Wave L3, 2026-08-26).
 *
 * Deviations from the source page:
 *
 *  - **Chrome dropped**: the source page owned `<SiteNav variant="dark">` and
 *    `<LoadingVeil>` (whole-page chrome) — both are landing-lab-only shell
 *    elements this chapter doesn't own (the flight page's own chrome covers
 *    it), same call Ch1's and Ch2's ports made.
 *
 *  - **Scroll is progress-driven, not page-scroll-driven (D1)**: the source
 *    page read whole-document `scrollY` via its own `useScrollProgress`
 *    (`concepts/seoul/scroll.ts`). This chapter is one scroll-locked 140vh
 *    section of a 5-chapter flight, so `progress`/`progressRef` arrive as
 *    props from `useChapterProgress` instead (the same rewiring Ch1's
 *    `CameraRig.tsx` and Ch2's city-switching logic did for their own
 *    sources) — only `CameraRig.tsx`'s input changed, its KEYS interpolation
 *    is untouched.
 *
 *  - **`AssistantDock` and `ShapPanel` are not ported** (approved decision
 *    D3): the source's right/bottom chrome for an AI Q&A dock and a SHAP
 *    feature-importance panel are out of scope for this flight chapter. The
 *    `shap` data dependency they alone drove is removed all the way back to
 *    `useSeoulData`/`types.ts`/`geo.ts` (no orphaned fetch, no dead field).
 *
 *  - **Error/loading vocabulary**: the source's bespoke `<ErrorPanel>` is
 *    replaced by this repo's shared `WfDataState`/`WfPlaceholder` (same swap
 *    Ch1's and Ch2's ports made) — one "never a fabricated skyline" panel
 *    vocabulary across chapters instead of a one-off per chapter. The
 *    source's bespoke `<NoWebglPanel>` (no data dependency, no shared
 *    equivalent) is kept as a small inline notice — same "3D skipped, table
 *    carries the same data" message, now `ch3-`-scoped.
 */
import { useMemo, useState, type MutableRefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { useQuality } from '../shared/perf/QualityProvider'
import WfPlaceholder from '../../components/wireframe/WfPlaceholder'
import WfDataState from '../../components/wireframe/WfDataState'
import { dataState } from '../../types/dataState'
import { useSeoulData } from './useSeoulData'
import { supportsWebGL } from './capability'
import SeoulScene from './scene/SeoulScene'
import Sections from './sections/Sections'
import Hud from './sections/Hud'
import DistrictTable from './sections/DistrictTable'
import type { DistrictInfo } from './types'
import './ch3-airshed.css'

export interface Ch3AirshedSceneProps {
  /** rAF-throttled chapter progress (0..1) — drives the HTML narrative overlay. */
  progress: number
  /** Always-current chapter progress ref — read by the r3f camera rig without re-rendering. */
  progressRef: MutableRefObject<number>
}

export default function Ch3AirshedScene({ progress, progressRef }: Ch3AirshedSceneProps) {
  const { tier } = useQuality()
  const state = useSeoulData()
  const [webglOk] = useState(() => supportsWebGL())

  const [hoveredCode, setHoveredCode] = useState<string | null>(null)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  const data = state.status === 'ready' ? state.data : null
  const districtByCode = useMemo(() => {
    const m = new Map<string, DistrictInfo>()
    data?.districts.forEach((d) => m.set(d.code, d))
    return m
  }, [data])

  if (state.status === 'error') {
    // Never a fabricated skyline: the real reason lives in state.error (logged
    // for debugging); the honest, shared "no data" panel is what renders.
    console.error('[ch3-airshed] data load failed:', state.error)
    return (
      <div className="ch3-as ch3-as--fallback">
        <WfDataState state={dataState('error', { source: 'landing mirror snapshot' })} />
      </div>
    )
  }

  if (state.status === 'loading' || !data) {
    return (
      <div className="ch3-as ch3-as--fallback">
        <WfPlaceholder label="Loading Seoul's air…" />
      </div>
    )
  }

  const activeDistrict =
    (hoveredCode && districtByCode.get(hoveredCode)) || (selectedCode && districtByCode.get(selectedCode)) || null
  const highest = [...data.districts].sort((a, b) => b.pm25 - a.pm25)[0]

  return (
    <div className="ch3-as">
      {webglOk && (
        <Canvas
          className="ch3-as__canvas"
          camera={{ position: [0, 26, 40], fov: 42, near: 0.05, far: 220 }}
          dpr={[1, tier === 'low' ? 1.2 : 2]}
          gl={{ antialias: tier !== 'low', alpha: false }}
          role="img"
          aria-label={`3D visualization of Seoul's 25 districts, extruded by interpolated PM2.5. Highest reading this snapshot: ${highest?.nameEng ?? 'unknown'}. Full data in the table below.`}
        >
          <SeoulScene
            data={data}
            tier={tier}
            progressRef={progressRef}
            hoveredCode={hoveredCode}
            selectedCode={selectedCode}
            onHover={setHoveredCode}
            onSelect={setSelectedCode}
          />
        </Canvas>
      )}

      {/* No WebGL: the scroll narrative assumes a 3D backdrop it doesn't have here,
          so it's skipped rather than laid over an empty stage — the district table
          below still carries every number the 3D view would have shown. */}
      {!webglOk && (
        <div className="ch3-as__nowebgl">
          <p className="ch3-as__nowebgl-h">This browser can't render the 3D view.</p>
          <p className="ch3-as__nowebgl-b">
            WebGL isn't available here, so the 3D city is skipped rather than shown broken — the
            district table below carries the same data.
          </p>
        </div>
      )}
      {webglOk && <Sections progress={progress} data={data} />}

      <aside className="ch3-rail" aria-label="District detail">
        <Hud district={activeDistrict} snapshotMs={data.pm25.meta.timestamp} forecastGap={data.forecastGap} />
      </aside>

      <DistrictTable
        districts={data.districts}
        hoveredCode={hoveredCode}
        selectedCode={selectedCode}
        onHover={setHoveredCode}
        onSelect={setSelectedCode}
      />
    </div>
  )
}
