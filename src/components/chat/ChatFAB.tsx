/**
 * ChatFAB — the floating "ASK" action button. Ported from
 * AirLens-platform apps/web/src/components/chat/ChatFAB.tsx, stubbed per the
 * porting brief: the source's route/auth/config gating (`useLocation`,
 * `useChatStore`, `useAuthStore`, `isChatbotConfigured`) is dropped — this
 * port is a plain presentational FAB with `isOpen`/`onToggle` props and a
 * `children` slot for whatever panel content the caller wants to show when
 * open. react-i18next stripped — plain-English default props.
 *
 * Wave 4 Block 3 (Δ4): the toggle glyph now uses the custom icon set's
 * `LiveIcon` (closed — the mockup's "live" concentric-circle mark) and
 * `CloseIcon` (open), replacing the generic inline target/X svgs.
 *
 * Wave 5 Δ5 (B3): the panel is a gesture-table surface (sheet/capsule/chat-
 * panel/flick — the one bounce-spring-eligible category in the Δ5 motion
 * contract). `isOpen`/`onToggle`/`children` stay the public API (both call
 * sites — ChatWidget and the DesignGallery demo — pass `<ChatPanel .../>`
 * unconditionally as `children` and rely on this component to gate mounting
 * on `isOpen`), so the spring + drag-dismiss machinery lives here rather
 * than being pushed onto callers. The wrapper stays mounted a little past
 * `isOpen` going false so the close animation/drag-release can finish before
 * it leaves the DOM — see `mounted` below.
 */
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { LiveIcon, CloseIcon } from '../icons'
import { projectMomentum, rubberband } from '../../motion/spring'
import { useSpring } from '../../motion/useSpring'

export interface ChatFABProps {
  isOpen: boolean
  onToggle: () => void
  /** Panel content shown above the button when `isOpen` — omit to render just the button. */
  children?: ReactNode
  openLabel?: string
  closeLabel?: string
  closeTooltip?: string
  openTooltip?: string
}

// Δ5 §07 gesture-table entry: ζ0.8 / r0.30 — registered for sheet, capsule,
// chat-panel, and flick surfaces only (not the ζ1.0/r0.35 default).
const PANEL_SPRING = { damping: 0.8, response: 0.3 }
// Flick-to-dismiss threshold shared with CapsulePanel's own drag (px/s).
const VELOCITY_DISMISS_PX_S = 40
// Used only for the very first close target, before the panel has ever been
// measured (it is invisible at that point — unmounted — so an inexact
// distance causes no visible glitch). Refined to the real rendered height
// once the panel first mounts.
const FALLBACK_CLOSED_Y = 480

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a, input, textarea, select') !== null
}

export default function ChatFAB({
  isOpen,
  onToggle,
  children,
  openLabel = 'ASK ↗',
  closeLabel = 'CLOSE',
  closeTooltip = 'Close chat',
  openTooltip = 'Open Field Assistant',
}: ChatFABProps) {
  // `closing` lags `isOpen` going false until the close animation settles,
  // so the panel can slide/fade out instead of hard-unmounting mid-
  // transition. `prevIsOpen` is `useState`, not a ref, and the comparison
  // runs in the render body — the same "adjusting state when a prop
  // changes" pattern Materialize.tsx already uses for this exact problem
  // (its own comment cites `useAnchorRect.ts` as the third precedent). Refs
  // can't be read/written during render (`react-hooks/refs`), and an effect
  // that calls setState purely to mirror a prop is the
  // `react-hooks/set-state-in-effect` antipattern — this sidesteps both.
  // The actual spring `.set()` call is *not* here (it's a side effect, not
  // a state update) — it happens in the `[isOpen]` effect below.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  const [closing, setClosing] = useState(false)
  const mounted = isOpen || closing
  const isOpenRef = useRef(isOpen)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const closedYRef = useRef(FALLBACK_CLOSED_Y)
  const translateY = useSpring(isOpen ? 0 : FALLBACK_CLOSED_Y, PANEL_SPRING)
  const dragRef = useRef({ dragging: false, startY: 0, startTranslate: 0, lastY: 0, lastT: 0, velocity: 0 })

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (!isOpen) setClosing(true)
  }

  useEffect(() => {
    isOpenRef.current = isOpen
    translateY.set(isOpen ? 0 : closedYRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Drives the wrapper's transform imperatively (no re-render per frame,
  // same pattern as CapsulePanel) and clears `closing` once a close has
  // fully settled — `apply` stops firing once the spring settles
  // (SpringEngine drops it from its active set), so this fires exactly
  // once per close.
  useEffect(() => {
    const apply = (y: number) => {
      const el = wrapRef.current
      if (el) el.style.transform = `translateY(${y}px)`
      if (!isOpenRef.current && y >= closedYRef.current - 0.5) setClosing(false)
    }
    apply(translateY.get())
    return translateY.subscribe(apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Measures the panel's real height once it has something to measure —
  // refines the close target past the FALLBACK_CLOSED_Y guess.
  useEffect(() => {
    if (!mounted) return
    const el = wrapRef.current
    if (el) closedYRef.current = el.offsetHeight + 40
  }, [mounted])

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    if (isInteractiveTarget(e.target)) return
    // Drag handle = the panel header only. A whole-panel capture zone eats
    // text selection on the static copy today, and would eat message-list
    // scrolling on touch once history is ported (review finding).
    if (!(e.target instanceof HTMLElement) || e.target.closest('.chat-head') === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      dragging: true,
      startY: e.clientY,
      startTranslate: translateY.get(),
      lastY: e.clientY,
      lastT: performance.now(),
      velocity: 0,
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>): void {
    const d = dragRef.current
    if (!d.dragging) return
    const dy = e.clientY - d.startY
    let next = d.startTranslate + dy
    // Rubberband both past "fully open" (0) and past "fully closed" (closedY).
    if (next < 0) next = -rubberband(-next)
    const closedY = closedYRef.current
    if (next > closedY) next = closedY + rubberband(next - closedY)
    // `.jump()` (not a direct style write) keeps the spring's own position in
    // sync with the drag, so release can hand off velocity without a stale-
    // position snap.
    translateY.jump(next)

    const now = performance.now()
    const dt = now - d.lastT
    if (dt > 0) d.velocity = ((e.clientY - d.lastY) / dt) * 1000
    d.lastY = e.clientY
    d.lastT = now
  }

  function onPointerUp(_e: ReactPointerEvent<HTMLDivElement>): void {
    const d = dragRef.current
    if (!d.dragging) return
    d.dragging = false
    const current = translateY.get()
    const closedY = closedYRef.current
    const projected = current + projectMomentum(d.velocity)
    const shouldClose = Math.abs(d.velocity) > VELOCITY_DISMISS_PX_S ? d.velocity > 0 : projected > closedY / 2

    if (shouldClose) {
      translateY.set(closedY, { velocity: d.velocity })
      if (isOpenRef.current) onToggle()
    } else {
      translateY.set(0, { velocity: d.velocity })
    }
  }

  return (
    <>
      {mounted ? (
        <div
          ref={wrapRef}
          className="chat-panel-spring"
          data-open={isOpen}
          inert={!isOpen}
          aria-hidden={!isOpen}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {children}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        aria-label={isOpen ? closeTooltip : openTooltip}
        aria-expanded={isOpen}
        className={`fab${isOpen ? ' fab-open' : ''}`}
      >
        <span className="fab-eyebrow">{isOpen ? closeLabel : openLabel}</span>
        <span className="fab-glyph" aria-hidden="true">
          {isOpen ? <CloseIcon size={16} /> : <LiveIcon size={16} />}
        </span>
      </button>
    </>
  )
}
