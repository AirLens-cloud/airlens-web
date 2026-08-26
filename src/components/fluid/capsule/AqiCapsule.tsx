import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useReducedMotion } from '../../../landing/shared/perf/useReducedMotion'
import { useSpring } from '../../../motion/useSpring'
import LiquidGlass from '../LiquidGlass'
import AqiDot from '../../wireframe/AqiDot'
import CapsulePanel from './CapsulePanel'
import { useCapsuleData } from './useCapsuleData'

const CAPSULE_SPRING = { damping: 0.68, response: 0.38 }
const COLLAPSED_W = 220
const COLLAPSED_H = 56
const EXPANDED_W = 320
const EXPANDED_H = 300
const PANEL_PAD = 20

/** Assumed forecast cadence — matches the sibling grid-snapshot pipeline's
 * 3h cron (see docs/DATA-SNAPSHOT.md provenance for this mirror). Purely a
 * countdown display; never asserted as a live guarantee. */
const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000
const ALERT_AUTOCLOSE_MS = 4000
const ALERT_SESSION_KEY = 'airlens-capsule-alert-shown'

function hasShownAlert(): boolean {
  try {
    return sessionStorage.getItem(ALERT_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function markAlertShown(): void {
  try {
    sessionStorage.setItem(ALERT_SESSION_KEY, '1')
  } catch {
    return
  }
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

/**
 * AqiCapsule — floating pill that expands into a 2-page glass panel
 * (current reading + range, then a 24h sparkline). idle -> open on
 * hover/click/keyboard, plus a one-shot session alert when the forecast
 * worsens in the next 24h.
 */
export default function AqiCapsule(): ReactNode {
  const data = useCapsuleData()
  useReducedMotion()
  const [open, setOpen] = useState(false)
  const [pulsing, setPulsing] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const panelId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const userInteractedRef = useRef(false)
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const width = useSpring(COLLAPSED_W, CAPSULE_SPRING)
  const height = useSpring(COLLAPSED_H, CAPSULE_SPRING)

  useEffect(() => {
    const applyW = (v: number) => {
      if (shellRef.current) shellRef.current.style.width = `${v}px`
    }
    const applyH = (v: number) => {
      if (shellRef.current) shellRef.current.style.height = `${v}px`
    }
    applyW(width.get())
    applyH(height.get())
    const unsubW = width.subscribe(applyW)
    const unsubH = height.subscribe(applyH)
    return () => {
      unsubW()
      unsubH()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyOpen(next: boolean): void {
    setOpen(next)
    width.set(next ? EXPANDED_W : COLLAPSED_W)
    height.set(next ? EXPANDED_H : COLLAPSED_H)
  }

  function clearAutoCloseTimer(): void {
    if (autoCloseTimerRef.current !== null) {
      clearTimeout(autoCloseTimerRef.current)
      autoCloseTimerRef.current = null
    }
  }

  function closeAndReturnFocus(): void {
    const wasFocusInside = rootRef.current?.contains(document.activeElement) ?? false
    userInteractedRef.current = true
    clearAutoCloseTimer()
    applyOpen(false)
    if (wasFocusInside) triggerRef.current?.focus()
  }

  function handleTriggerClick(): void {
    userInteractedRef.current = true
    clearAutoCloseTimer()
    const next = !open
    applyOpen(next)
    if (next) triggerRef.current?.focus()
    else if (rootRef.current?.contains(document.activeElement)) triggerRef.current?.focus()
  }

  function handleTriggerKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleTriggerClick()
    }
  }

  function handlePointerEnter(e: ReactPointerEvent<HTMLDivElement>): void {
    if (e.pointerType !== 'mouse') return
    clearAutoCloseTimer()
    applyOpen(true)
  }

  function handlePointerLeave(e: ReactPointerEvent<HTMLDivElement>): void {
    if (e.pointerType !== 'mouse') return
    if (userInteractedRef.current) return
    applyOpen(false)
  }

  // Alert: 1x per session, sessionStorage-gated. Auto-opens + pulses, then
  // auto-collapses unless the visitor has since interacted deliberately.
  useEffect(() => {
    if (data.status !== 'ready' || data.alert !== 'worsening') return
    if (hasShownAlert()) return
    markAlertShown()

    const kickoff = setTimeout(() => {
      applyOpen(true)
      setPulsing(true)
      autoCloseTimerRef.current = setTimeout(() => {
        setPulsing(false)
        if (!userInteractedRef.current) applyOpen(false)
      }, ALERT_AUTOCLOSE_MS)
    }, 0)

    return () => {
      clearTimeout(kickoff)
      clearAutoCloseTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  useEffect(() => {
    if (data.status !== 'ready') return
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [data.status])

  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAndReturnFocus()
        return
      }
      if (e.key !== 'Tab' || !rootRef.current) return
      const items = getFocusable(rootRef.current)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    function onPointerDown(e: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closeAndReturnFocus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const radius = open ? 20 : COLLAPSED_H / 2
  const phase = pulsing ? 'alerting' : open ? 'open' : 'idle'

  let idle: ReactNode
  let ariaLabel: string
  if (data.status === 'loading') {
    idle = <span className="aq-capsule__value">···</span>
    ariaLabel = 'Air quality loading, expand for details'
  } else if (data.status === 'missing') {
    idle = <span className="aq-capsule__value">NO FEED</span>
    ariaLabel = 'Air quality feed unavailable, expand for details'
  } else {
    const remaining = REFRESH_INTERVAL_MS - (nowTick - new Date(data.updatedAt).getTime())
    idle = (
      <>
        <AqiDot tier={data.tier} size={10} />
        <span className="aq-capsule__value">{Math.round(data.current)}</span>
        <span className="aq-capsule__unit">µg/m³</span>
        <span className="aq-capsule__countdown">{formatCountdown(remaining)}</span>
      </>
    )
    ariaLabel = `Air quality ${Math.round(data.current)} PM2.5, expand for details`
  }

  return (
    <div
      ref={rootRef}
      className="aq-capsule"
      data-phase={phase}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <div ref={shellRef} className="aq-capsule__shell">
        <LiquidGlass as="div" variant="night" radius={radius} className="aq-capsule__glass">
          <button
            ref={triggerRef}
            type="button"
            className="aq-capsule__trigger"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={ariaLabel}
            onClick={handleTriggerClick}
            onKeyDown={handleTriggerKeyDown}
          >
            {idle}
          </button>
          {open && data.status === 'ready' && (
            <div id={panelId} className="aq-capsule__panel">
              <CapsulePanel data={data} contentWidth={EXPANDED_W - PANEL_PAD * 2} />
            </div>
          )}
        </LiquidGlass>
      </div>
    </div>
  )
}
