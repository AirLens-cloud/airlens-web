import WfPlaceholder from '../components/wireframe/WfPlaceholder'

export interface ChapterCanvasSlotProps {
  /** Chapter label shown inside the placeholder (e.g. "Ch. 1"). */
  chapterLabel: string
  className?: string
}

/**
 * ChapterCanvasSlot — static X-pattern placeholder for a chapter that doesn't
 * have a scene yet. `three` / `@react-three/fiber` are installed but this
 * component never imports them — the flight shell must not pull the 3D
 * bundle before there is a scene to show.
 *
 * Wave L1: Chapter 1 has moved off this shared placeholder onto its own
 * `React.lazy()` + `Suspense` boundary (`ch1-atmos/Ch1AtmosCanvasSlot.tsx`),
 * wired directly from `LandingFlight.tsx`. This component now renders only
 * for Chapters 2/3, until each gets the same lazy-boundary treatment in
 * Wave L2/L3.
 */
export function ChapterCanvasSlot({ chapterLabel, className }: ChapterCanvasSlotProps) {
  const classes = ['landing-canvas-slot', 'landing-canvas-slot--placeholder']
  if (className) classes.push(className)
  return (
    <div className={classes.join(' ')}>
      <WfPlaceholder label={`${chapterLabel} — 3D scene (Wave L2-L3)`} />
    </div>
  )
}
