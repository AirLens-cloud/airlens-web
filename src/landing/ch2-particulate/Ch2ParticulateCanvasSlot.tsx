/**
 * Ch2ParticulateCanvasSlot — the React.lazy() + Suspense boundary for Chapter
 * 2's scene, mirroring `Ch1AtmosCanvasSlot` (Wave L1) rather than
 * generalizing a per-chapter registry. `Ch1AtmosCanvasSlot.tsx`'s own comment
 * already weighed this: a registry needs a second and third concrete shape to
 * generalize from before it's worth building. This is that second shape, and
 * it is identical in structure to the first (a `lazy()` import + a
 * `Suspense` fallback) — still not enough repetition to justify a registry
 * over two chapter-specific files. Left for Ch3 (or a later pass) to decide
 * once there is a third data point.
 *
 * Chapter 3 (Wave L3) still renders the untouched `ChapterCanvasSlot`
 * placeholder from `LandingFlight.tsx` until its own scene lands.
 */
import { lazy, Suspense, type MutableRefObject } from 'react'
import WfPlaceholder from '../../components/wireframe/WfPlaceholder'

const Ch2ParticulateScene = lazy(() => import('./Ch2ParticulateScene'))

export interface Ch2ParticulateCanvasSlotProps {
  progress: number
  progressRef: MutableRefObject<number>
}

export function Ch2ParticulateCanvasSlot({ progress, progressRef }: Ch2ParticulateCanvasSlotProps) {
  return (
    <div className="landing-canvas-slot">
      <Suspense
        fallback={
          <div className="landing-canvas-slot--placeholder">
            <WfPlaceholder label="Chapter 2 — loading" />
          </div>
        }
      >
        <Ch2ParticulateScene progress={progress} progressRef={progressRef} />
      </Suspense>
    </div>
  )
}
