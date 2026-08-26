import { useRef } from 'react'
import { useChapterProgress } from '../landing/shared/useChapterProgress'
import { ChapterCanvasSlot } from '../landing/ChapterCanvasSlot'
import { Ch1AtmosCanvasSlot } from '../landing/ch1-atmos/Ch1AtmosCanvasSlot'
import { Ch2ParticulateCanvasSlot } from '../landing/ch2-particulate/Ch2ParticulateCanvasSlot'
import { Ch3AirshedCanvasSlot } from '../landing/ch3-airshed/Ch3AirshedCanvasSlot'
import Ch4BriefingRoom from '../landing/ch4-briefing/Ch4BriefingRoom'
import Ch5CtaLanding from '../landing/ch5-cta/Ch5CtaLanding'
import { QualityProvider } from '../landing/shared/perf/QualityProvider'
import '../styles/landing.css'

interface ChapterDef {
  id: string
  label: string
  /** Section height in viewport-height units — the scroll travel budget for this chapter. */
  vh: number
  /** Ch1-3 reserve a 3D (`three`) scene slot (Wave L1-L3); Ch4-5 are Canvas 2D/SVG/DOM only (Wave L4, no `three`). */
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
  const { progress, progressRef } = useChapterProgress(ref)

  return (
    <section
      ref={ref}
      id={id}
      className="landing-chapter"
      style={{ minHeight: `${vh}vh` }}
      data-testid={`landing-chapter-${id}`}
    >
      {hasCanvasSlot ? (
        id === 'ch1' ? (
          <Ch1AtmosCanvasSlot progress={progress} progressRef={progressRef} />
        ) : id === 'ch2' ? (
          <Ch2ParticulateCanvasSlot progress={progress} progressRef={progressRef} />
        ) : id === 'ch3' ? (
          <Ch3AirshedCanvasSlot progress={progress} progressRef={progressRef} />
        ) : (
          <ChapterCanvasSlot chapterLabel={label} />
        )
      ) : id === 'ch4' ? (
        <Ch4BriefingRoom progress={progress} />
      ) : id === 'ch5' ? (
        <Ch5CtaLanding />
      ) : null}
    </section>
  )
}

/**
 * LandingFlight — Wave L0 shell for the "full flight" 5-chapter landing page.
 * Each chapter is its own tall `<section>` with independent scroll progress
 * (`useChapterProgress`); `three`/`@react-three/fiber` are not imported here —
 * chapter scenes land in Wave L1-L5, each behind its own `React.lazy()`
 * boundary (Chapter 1's is `Ch1AtmosCanvasSlot`, Wave L1; Chapter 2's is
 * `Ch2ParticulateCanvasSlot`, Wave L2; Chapter 3's is `Ch3AirshedCanvasSlot`,
 * Wave L3). Chapters 4-5 (Wave L4) are deliberately `three`-free — the dawn
 * wipe into the briefing room (`Ch4BriefingRoom`) and the flight's final CTA
 * (`Ch5CtaLanding`) are Canvas 2D/SVG/DOM content, mounted directly (no lazy
 * boundary — there is no `three` bundle here to defer loading of).
 *
 * `QualityProvider` wraps the whole flight (not per-chapter) so every chapter
 * scene shares one render-quality tier decision instead of re-probing FPS
 * per chapter.
 */
export default function LandingFlight() {
  return (
    <QualityProvider>
      <main className="landing-flight" data-testid="landing-flight">
        {CHAPTERS.map((chapter) => (
          <LandingChapter key={chapter.id} {...chapter} />
        ))}
      </main>
    </QualityProvider>
  )
}
