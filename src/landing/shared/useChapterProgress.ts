import { useEffect, useRef, useState, type RefObject } from 'react'

export interface ChapterProgress {
  /** Always current; read inside per-frame loops (e.g. an r3f `useFrame`) without triggering a re-render. */
  progressRef: RefObject<number>
  /** rAF-throttled state, for HTML overlays that need to re-render on change. */
  progress: number
}

function computeProgress(el: HTMLElement): number {
  const rect = el.getBoundingClientRect()
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight
  const span = viewportHeight + rect.height
  if (span <= 0) return 0
  const raw = (viewportHeight - rect.top) / span
  return raw < 0 ? 0 : raw > 1 ? 1 : raw
}

/**
 * Per-chapter scroll progress, 0..1, driven by one container element's
 * position in the viewport rather than global `scrollY` — each of the 5
 * flight chapters is its own tall `<section>`, so progress must be scoped to
 * that section, not the whole page.
 *
 *   0 — the section's top edge has just reached the viewport's bottom edge
 *   1 — the section's bottom edge has just reached the viewport's top edge
 *
 * Same dual-track shape as the source pattern this is adapted from
 * (AirLens-platform apps/landing-lab `src/concepts/atmos/scroll.ts`, which
 * tracks whole-document `scrollY` instead of one element's bounding rect):
 * `progressRef` updates synchronously on every scroll/resize event (safe to
 * read from a `useFrame` loop without re-rendering); `progress` state is
 * rAF-throttled for HTML narrative overlays that must re-render.
 *
 * SSR-safe (no `window` at render time) and safe when `ref.current` is null
 * (nothing to measure yet — progress stays 0 until the section mounts).
 */
export function useChapterProgress(ref: RefObject<HTMLElement | null>): ChapterProgress {
  const progressRef = useRef(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return

    let raf = 0
    const onScroll = () => {
      const p = computeProgress(el)
      progressRef.current = p
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0
          setProgress(progressRef.current)
        })
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref])

  return { progressRef, progress }
}
