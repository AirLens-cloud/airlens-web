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
import { useSmoothedProgress } from '../shared/useSmoothedProgress'

const Ch2ParticulateScene = lazy(() => import('./Ch2ParticulateScene'))

export interface Ch2ParticulateCanvasSlotProps {
  progress: number
  progressRef: MutableRefObject<number>
}

/**
 * Wave 4 P2 — "descent scrub inertia": the raw `progressRef` this slot
 * receives is swapped for a spring-smoothed one before it reaches the scene,
 * so a per-frame reader gets a value that settles into scroll position
 * rather than snapping to it. `Ch2ParticulateScene` itself is untouched
 * (accepts `progressRef` in its prop shape already, but its city-switching
 * logic reads the rAF-throttled `progress` state instead — see that file's
 * own prop-shape comment) — this is purely a wiring swap at the slot layer.
 */
export function Ch2ParticulateCanvasSlot({ progress, progressRef }: Ch2ParticulateCanvasSlotProps) {
  const smoothedRef = useSmoothedProgress(progressRef)
  return (
    <div className="landing-canvas-slot">
      <Suspense
        fallback={
          <div className="landing-canvas-slot--placeholder">
            <WfPlaceholder label="Chapter 2 — loading" />
          </div>
        }
      >
        <Ch2ParticulateScene progress={progress} progressRef={smoothedRef} />
      </Suspense>
    </div>
  )
}
