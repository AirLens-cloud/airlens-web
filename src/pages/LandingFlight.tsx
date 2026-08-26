import { useRef } from 'react'
import { useChapterProgress } from '../landing/shared/useChapterProgress'
import { ChapterCanvasSlot } from '../landing/ChapterCanvasSlot'
import '../styles/landing.css'

interface ChapterDef {
  id: string
  label: string
  /** Section height in viewport-height units — the scroll travel budget for this chapter. */
  vh: number
  /** Ch1-3 reserve a 3D scene slot (Wave L1-L3); Ch4-5 do not (per the approved storyboard). */
  hasCanvasSlot: boolean
}

// 5-chapter "full flight" storyboard shell. Chapter scene content (the 3D
// visuals each canvas slot will hold) is Wave L1-L5 — this file only owns the
// section scaffolding, scroll-progress wiring, and canvas-slot boundaries.
const CHAPTERS: ChapterDef[] = [
  { id: 'ch1', label: 'Chapter 1', vh: 260, hasCanvasSlot: true },
  { id: 'ch2', label: 'Chapter 2', vh: 140, hasCanvasSlot: true },
  { id: 'ch3', label: 'Chapter 3', vh: 140, hasCanvasSlot: true },
  { id: 'ch4', label: 'Chapter 4', vh: 120, hasCanvasSlot: false },
  { id: 'ch5', label: 'Chapter 5', vh: 100, hasCanvasSlot: false },
]

function LandingChapter({ id, label, vh, hasCanvasSlot }: ChapterDef) {
  const ref = useRef<HTMLElement | null>(null)
  const { progress } = useChapterProgress(ref)

  return (
    <section
      ref={ref}
      id={id}
      className="landing-chapter"
      style={{ minHeight: `${vh}vh` }}
      data-testid={`landing-chapter-${id}`}
    >
      <div className="landing-chapter-hud">
        <span className="landing-chapter-label">{label}</span>
        <span className="landing-chapter-progress" data-testid={`landing-chapter-progress-${id}`}>
          {progress.toFixed(2)}
        </span>
      </div>
      {hasCanvasSlot ? <ChapterCanvasSlot chapterLabel={label} /> : null}
    </section>
  )
}

/**
 * LandingFlight — Wave L0 shell for the "full flight" 5-chapter landing page.
 * Each chapter is its own tall `<section>` with independent scroll progress
 * (`useChapterProgress`); `three`/`@react-three/fiber` are not imported here —
 * chapter scenes land in Wave L1-L5 via `ChapterCanvasSlot`'s `React.lazy()`
 * boundary.
 */
export default function LandingFlight() {
  return (
    <main className="landing-flight" data-testid="landing-flight">
      {CHAPTERS.map((chapter) => (
        <LandingChapter key={chapter.id} {...chapter} />
      ))}
    </main>
  )
}
