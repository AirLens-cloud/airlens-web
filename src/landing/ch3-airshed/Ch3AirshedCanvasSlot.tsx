/**
 * Ch3AirshedCanvasSlot — the React.lazy() + Suspense boundary for Chapter 3's
 * scene, mirroring `Ch1AtmosCanvasSlot`/`Ch2ParticulateCanvasSlot` rather than
 * generalizing a per-chapter registry. Both of those files' own comments
 * already weighed this (a registry needs a real second/third shape to
 * generalize from before it's worth building); this is that third shape, and
 * it is still identical in structure to the first two (a `lazy()` import + a
 * `Suspense` fallback) — still not enough to justify a registry over three
 * chapter-specific files. Left for a later pass, once Ch4/Ch5 (which the
 * approved storyboard says carry no canvas slot at all) make the question
 * moot for this flight.
 */
import { lazy, Suspense, type MutableRefObject } from 'react'
import WfPlaceholder from '../../components/wireframe/WfPlaceholder'

const Ch3AirshedScene = lazy(() => import('./Ch3AirshedScene'))

export interface Ch3AirshedCanvasSlotProps {
  progress: number
  progressRef: MutableRefObject<number>
}

export function Ch3AirshedCanvasSlot({ progress, progressRef }: Ch3AirshedCanvasSlotProps) {
  return (
    <div className="landing-canvas-slot">
      <Suspense
        fallback={
          <div className="landing-canvas-slot--placeholder">
            <WfPlaceholder label="Chapter 3 — loading" />
          </div>
        }
      >
        <Ch3AirshedScene progress={progress} progressRef={progressRef} />
      </Suspense>
    </div>
  )
}
