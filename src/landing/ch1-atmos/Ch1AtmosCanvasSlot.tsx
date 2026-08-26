/**
 * Ch1AtmosCanvasSlot — the React.lazy() + Suspense boundary for Chapter 1's
 * scene, replacing `ChapterCanvasSlot`'s static placeholder for this one
 * chapter (Wave L1). `three`/`@react-three/fiber` only enter the bundle once
 * this dynamic import resolves, so the main chunk stays free of them until a
 * chapter that needs them is actually reached.
 *
 * Chapters 2/3 (Wave L2/L3) still render the untouched `ChapterCanvasSlot`
 * placeholder from `LandingFlight.tsx` — this component is intentionally
 * chapter-specific rather than a generalized per-chapter registry; the L0
 * shell comment sketched `ChapterCanvasSlot` itself becoming the swap point,
 * but that would require it to carry a chapter id and a union of every future
 * chapter's prop shape before there is a second chapter to generalize for.
 * Generalizing this into a registry is left for L2/L3, once there is a real
 * second and third shape to generalize from.
 */
import { lazy, Suspense, type MutableRefObject } from 'react'
import WfPlaceholder from '../../components/wireframe/WfPlaceholder'

const Ch1AtmosScene = lazy(() => import('./Ch1AtmosScene'))

export interface Ch1AtmosCanvasSlotProps {
  progress: number
  progressRef: MutableRefObject<number>
}

export function Ch1AtmosCanvasSlot({ progress, progressRef }: Ch1AtmosCanvasSlotProps) {
  return (
    <div className="landing-canvas-slot">
      <Suspense
        fallback={
          <div className="landing-canvas-slot--placeholder">
            <WfPlaceholder label="Chapter 1 — loading" />
          </div>
        }
      >
        <Ch1AtmosScene progress={progress} progressRef={progressRef} />
      </Suspense>
    </div>
  )
}
