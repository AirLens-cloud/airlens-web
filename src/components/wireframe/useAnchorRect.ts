import { useEffect, useState } from 'react'

/**
 * useAnchorRect — subscribes to the viewport rect of `[data-coachmark="<anchor>"]`.
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/useAnchorRect.ts.
 *
 * First measurement happens synchronously during the render where `anchor`
 * changes (read-only DOM access, no effect-scheduled setState). After that,
 * scroll/resize/ResizeObserver are rAF-throttled. Returns null when there is
 * no anchor or the anchor element is missing — the caller (WfCoachmark) falls
 * back to sheet mode rather than throwing.
 */
export default function useAnchorRect(anchor: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [measuredAnchor, setMeasuredAnchor] = useState<string | null>(null)

  if (anchor !== measuredAnchor) {
    setMeasuredAnchor(anchor)
    const el = anchor ? document.querySelector(`[data-coachmark="${anchor}"]`) : null
    setRect(el ? el.getBoundingClientRect() : null)
  }

  useEffect(() => {
    if (!anchor) return
    const el = document.querySelector(`[data-coachmark="${anchor}"]`)
    if (!el) return

    let raf = 0
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setRect(el.getBoundingClientRect())
      })
    }

    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule)
      ro.observe(el)
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      ro?.disconnect()
    }
  }, [anchor])

  return anchor ? rect : null
}
