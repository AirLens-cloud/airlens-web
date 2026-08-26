import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { WfCoachmarkProps } from './types'
import useAnchorRect from './useAnchorRect'

/**
 * WfCoachmark — non-blocking anchored onboarding primitive (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfCoachmark.tsx.
 *
 * - `role="dialog"` without `aria-modal` — non-modal. No focus trap, no
 *   auto-focus move (no scroll hijack). Step text is `aria-live="polite"`.
 * - Portal to body end -> Tab reaches it naturally. Esc dismisses via a global
 *   keydown listener. Enter is never intercepted (page interaction preserved).
 * - Title is a styled `<p>`, not a heading tag — a portal at the body's end
 *   would otherwise break the document heading order for assistive tech.
 * - No anchor / null rect / viewport <=480px -> falls back to a bottom sheet.
 * - Active anchor gets `data-coachmark-active` for CSS outline highlighting.
 *
 * CSS: src/styles/wireframe.css `.wf-coachmark`.
 */

const GUTTER = 16
const CARET_GAP = 12
const SHEET_QUERY = '(max-width: 480px)'

interface PopoverPos {
  left: number
  top: number
  caretX: number
  placement: 'top' | 'bottom'
}

function useSheetViewport(): boolean {
  const [sheet, setSheet] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(SHEET_QUERY).matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(SHEET_QUERY)
    const onChange = () => setSheet(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return sheet
}

export default function WfCoachmark({
  anchor,
  open,
  title,
  description,
  stepLabel,
  icon,
  actions,
  onDismiss,
  placement = 'auto',
  className,
}: WfCoachmarkProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const descId = useId()
  const rect = useAnchorRect(open ? anchor : null)
  const sheetViewport = useSheetViewport()
  const sheet = sheetViewport || rect === null
  const [pos, setPos] = useState<PopoverPos | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

  useEffect(() => {
    if (!open) return
    const el = document.querySelector(`[data-coachmark="${anchor}"]`)
    if (!el) return
    el.setAttribute('data-coachmark-active', '')
    return () => el.removeAttribute('data-coachmark-active')
  }, [open, anchor])

  useLayoutEffect(() => {
    if (!open || sheet || !rect) return
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const w = panel.offsetWidth
      const h = panel.offsetHeight
      const vw = window.innerWidth
      const vh = window.innerHeight
      const anchorCenter = rect.left + rect.width / 2
      const left = Math.min(
        Math.max(GUTTER, anchorCenter - w / 2),
        Math.max(GUTTER, vw - w - GUTTER),
      )
      let place: 'top' | 'bottom'
      if (placement === 'top' || placement === 'bottom') {
        place = placement
      } else {
        const below = vh - rect.bottom
        place = below >= h + CARET_GAP || below >= rect.top ? 'bottom' : 'top'
      }
      const top = place === 'bottom' ? rect.bottom + CARET_GAP : rect.top - h - CARET_GAP
      const caretX = Math.min(Math.max(CARET_GAP, anchorCenter - left), Math.max(CARET_GAP, w - CARET_GAP))
      setPos({ left, top, caretX, placement: place })
    })
    return () => cancelAnimationFrame(raf)
  }, [open, sheet, rect, placement])

  if (!open) return null

  const classes = ['wf-coachmark']
  if (sheet) classes.push('wf-coachmark--sheet')
  if (className) classes.push(className)

  const style = !sheet && pos
    ? ({ left: pos.left, top: pos.top, '--wf-coachmark-caret-x': `${pos.caretX}px` } as CSSProperties)
    : undefined

  return createPortal(
    <div
      ref={panelRef}
      className={classes.join(' ')}
      style={style}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-placement={sheet ? undefined : pos?.placement}
      data-testid="wf-coachmark"
    >
      <div className="wf-coachmark__live" aria-live="polite">
        <div className="wf-coachmark__head">
          {icon ? (
            <span className="wf-coachmark__icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div>
            {stepLabel ? <p className="wf-coachmark__step t-micro">{stepLabel}</p> : null}
            <p id={titleId} className="wf-coachmark__title">
              {title}
            </p>
          </div>
        </div>
        <p id={descId} className="wf-coachmark__desc t-caption">
          {description}
        </p>
      </div>
      <div className="wf-coachmark__actions">{actions}</div>
      {!sheet && <span className="wf-coachmark__caret" aria-hidden="true" />}
    </div>,
    document.body,
  )
}
