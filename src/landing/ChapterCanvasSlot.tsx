import WfPlaceholder from '../components/wireframe/WfPlaceholder'

export interface ChapterCanvasSlotProps {
  /** Chapter label shown inside the placeholder (e.g. "Ch. 1"). */
  chapterLabel: string
  className?: string
}

/**
 * ChapterCanvasSlot — React.lazy() boundary placeholder for a chapter's 3D
 * scene. Wave L0 (this file) only renders an empty X-pattern placeholder;
 * `three` / `@react-three/fiber` are installed but intentionally not
 * imported anywhere yet — the flight shell must not pull the 3D bundle
 * before there is a scene to show.
 *
 * 3D scene lands in Wave L1-L3: this component's body becomes
 *   const Scene = lazy(() => import('./ch1-atmos/Scene'))
 *   return <Suspense fallback={<WfPlaceholder .../>}><Scene {...} /></Suspense>
 * one per chapter, swapped in without touching LandingFlight.tsx's layout.
 */
export function ChapterCanvasSlot({ chapterLabel, className }: ChapterCanvasSlotProps) {
  const classes = ['landing-canvas-slot']
  if (className) classes.push(className)
  return (
    <div className={classes.join(' ')}>
      <WfPlaceholder label={`${chapterLabel} — 3D scene (Wave L1-L3)`} />
    </div>
  )
}
