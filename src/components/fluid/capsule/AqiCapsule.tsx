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
import LiquidGlass, { type LiquidGlassProps } from '../LiquidGlass'
import AqiDot from '../../wireframe/AqiDot'
import CapsulePanel from './CapsulePanel'
import { useCapsuleData } from './useCapsuleData'
import { useResolvedLocation } from '../../../hooks/useResolvedLocation'
import { usePrimaryReading } from '../../../hooks/usePrimaryReading'
import { LOCATING_LABEL } from '../../../lib/location/resolveLocation'
import { formatElapsed } from '../../../lib/home/whyNow'
import { formatCountdown } from './formatCountdown'

const CAPSULE_SPRING = { damping: 0.68, response: 0.38 }
const COLLAPSED_W = 220
// Taller than the pre-Tier-1 56px: the idle bar is now two rows (location
// label + warning on top, the reading below) so the capsule never shows a
// bare number with no location context — see AqiCapsule's header comment.
const COLLAPSED_H = 68
const EXPANDED_W = 320
const EXPANDED_H = 300
const PANEL_PAD = 20

const ALERT_AUTOCLOSE_MS = 4000
const ALERT_SESSION_KEY = 'airlens-capsule-alert-shown'

// P1 fix (2026-09-05 audit): the capsule is `position: fixed` near the top
// of every surface it mounts on, so on a tall page whatever content scrolls
// into that band gets covered (measured on /today: the Instruments section
// heading, mid-scroll). Rather than shrinking the pill itself (its two-row
// idle layout is a deliberate earlier fix — see the COLLAPSED_H comment
// above), it slides off-screen while the visitor scrolls down through
// content and returns the instant they scroll back up or land near the top
// — same "hide while reading, reappear on demand" pattern as a browser's
// own collapsing toolbar. Never hides while open or mid-alert (both checked
// at the `hidden &&` call site below).
const HIDE_NEAR_TOP_PX = 40
const HIDE_SCROLL_DELTA_PX = 8

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

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

export interface AqiCapsuleProps {
  /** Glass surface variant — night for the landing hero, day for light
   * surfaces (Today porting). */
  variant?: LiquidGlassProps['variant']
}

/**
 * AqiCapsule — floating pill that expands into a 2-page glass panel
 * (current reading + range, then a 24h sparkline). idle -> open on
 * hover/click/keyboard, plus a one-shot session alert when the forecast
 * worsens in the next 24h.
 *
 * W1a (`useResolvedLocation`): reads the same store-backed hook Home's hero
 * CTAs write to, so a visitor who opts in on Home sees the same resolved
 * location here on Today/Globe/Insights/Landing, not a second prompt.
 * Before that opt-in it falls back to the same IP-approximate point Home
 * uses, or a fixed Seoul default if that lookup also fails — the two
 * surfaces never disagree about where the visitor is.
 *
 * W1b commit ②: the idle bar and expanded panel's headline both read
 * `usePrimaryReading` — the same shared resolver `/today` and Home read —
 * so the capsule never shows a different number than either of them for the
 * same place and moment. The location row shows the visitor's own resolved
 * place (same eyebrow rules as `HomeHero`'s), badged by how the point was
 * obtained: nothing extra for an opt-in choice (geolocation or a searched
 * city), "APPROXIMATE" for the IP guess, and "DEFAULT · NOT YOURS" for the
 * Seoul fallback. The expanded panel's 24h chart/range stay CAMS's own
 * outlook (`useCapsuleData`) regardless of which source backs the headline.
 *
 * UI G1 (2026-09-05, approved mockup): the fallback/approximate states also
 * carry their own "Use my location" CTA directly on the expanded panel —
 * `requestGeolocation` from the same shared `useResolvedLocation` hook
 * Home's hero CTA already calls, so a pick made here and a pick made on
 * Home write to (and read from) the identical store; there is no second,
 * capsule-only location state. No auto-prompt: the browser permission
 * dialog only fires from this button's own click, never on mount.
 */
export default function AqiCapsule({ variant = 'night' }: AqiCapsuleProps = {}): ReactNode {
  const { location, requesting, denied, requestGeolocation } = useResolvedLocation()
  const locationSource = location?.source ?? null
  const placeLabel = location?.label ?? LOCATING_LABEL
  const data = useCapsuleData(location)
  const reducedMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [pulsing, setPulsing] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [scrolledAway, setScrolledAway] = useState(false)
  // `nowTick` ticks every second while a reading is up (below) — the same
  // clock feeds `usePrimaryReading`'s `ageMs`/countdown math, so the idle
  // bar's countdown live-updates without a second timer.
  const { reading } = usePrimaryReading(location, nowTick)

  const panelId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const userInteractedRef = useRef(false)
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alertKickoffRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  // Stays wired to `data` (the CAMS 24h outlook), not `reading` — the
  // "worsening" signal compares forecast hours with each other regardless
  // of which source backs the headline (same invariant as HomeHeroRail's
  // trend tile). It also waits for `reading` itself: the panel only renders
  // once the headline resolves, and CAMS (~180 KB) usually lands well before
  // the grid (~2.5 MB) — firing on `data` alone opened an empty capsule and
  // spent the one-per-session alert before there was anything to show.
  useEffect(() => {
    if (data.status !== 'ready' || data.alert !== 'worsening') return
    if (reading.status !== 'ready') return
    if (hasShownAlert()) return
    markAlertShown()

    // No per-run cleanup on purpose: once marked shown, a dependency change
    // (or StrictMode's dev re-run) must not cancel the auto-close timer —
    // that left the capsule open and pulsing for good, or never showed the
    // alert at all. The timers are cleared on unmount only (effect below).
    alertKickoffRef.current = setTimeout(() => {
      applyOpen(true)
      setPulsing(true)
      autoCloseTimerRef.current = setTimeout(() => {
        setPulsing(false)
        if (!userInteractedRef.current) applyOpen(false)
      }, ALERT_AUTOCLOSE_MS)
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, reading.status])

  useEffect(() => {
    return () => {
      if (alertKickoffRef.current !== null) clearTimeout(alertKickoffRef.current)
      clearAutoCloseTimer()
    }
  }, [])

  useEffect(() => {
    if (reading.status !== 'ready') return
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [reading.status])

  // Hide-on-scroll-down (see the HIDE_* constants' header comment). Skipped
  // under reduced motion — the capsule simply stays put rather than
  // sliding, same call other spring-driven UI in this codebase makes.
  useEffect(() => {
    if (reducedMotion || typeof window === 'undefined') return
    let lastY = window.scrollY
    let rafId = 0

    function evaluate(): void {
      const y = window.scrollY
      const delta = y - lastY
      if (y <= HIDE_NEAR_TOP_PX) setScrolledAway(false)
      else if (delta > HIDE_SCROLL_DELTA_PX) setScrolledAway(true)
      else if (delta < -HIDE_SCROLL_DELTA_PX) setScrolledAway(false)
      lastY = y
      rafId = 0
    }

    function onScroll(): void {
      if (rafId) return
      rafId = requestAnimationFrame(evaluate)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [reducedMotion])

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
  // Never actually hide while it's open or announcing an alert — only the
  // idle collapsed pill slides away.
  const hidden = scrolledAway && !open && phase !== 'alerting'

  let idle: ReactNode
  let ariaLabel: string
  if (reading.status === 'loading') {
    idle = <span className="aq-capsule__value">···</span>
    ariaLabel = 'Air quality loading, expand for details'
  } else if (reading.status === 'unavailable') {
    idle = <span className="aq-capsule__value">NO FEED</span>
    ariaLabel = 'Air quality feed unavailable, expand for details'
  } else {
    // Null age (unparseable publish time): no countdown and no elapsed
    // figure can be honest, so the chip says the time is unknown instead.
    const remaining = reading.ageMs === null ? null : reading.refreshMs - reading.ageMs
    const refreshHours = Math.round(reading.refreshMs / (60 * 60 * 1000))
    const sourceNoun = reading.source === 'analysis' ? 'analysis' : 'forecast'
    // UI G4 (2026-09-05 design audit): the bare `mm:ss` countdown had no
    // visible label anywhere — its meaning (time to the next refresh, at
    // this reading's own cadence) only exists in this title. A `title`
    // attribute surfaces it on hover/focus without spending any of the idle
    // bar's tight width on a permanent label; the stale branch gets its
    // own, distinct explanation.
    const countdownTitle =
      remaining === null
        ? `This ${sourceNoun}'s publish time is unknown`
        : remaining > 0
          ? `Next ${sourceNoun} refresh in ${formatCountdown(remaining)} (updates every ${refreshHours}h)`
          : `This ${sourceNoun} is older than its usual ${refreshHours}h refresh window`
    const countdownText =
      remaining === null || reading.ageMs === null
        ? '—'
        : remaining > 0
          ? formatCountdown(remaining)
          : formatElapsed(reading.ageMs)
    idle = (
      <>
        <span className="aq-capsule__loc-row t-micro">
          <span className="aq-capsule__loc">{placeLabel}</span>
          {locationSource === 'approx' && <span className="aq-capsule__warn">APPROXIMATE</span>}
          {locationSource === 'default' && <span className="aq-capsule__warn">DEFAULT · NOT YOURS</span>}
        </span>
        <span className="aq-capsule__reading-row">
          <AqiDot tier={reading.tier} size={10} />
          <span className="aq-capsule__value">{Math.round(reading.pm25)}</span>
          <span className="aq-capsule__unit">µg/m³</span>
          <span
            className="aq-capsule__countdown"
            data-stale={remaining === null || remaining <= 0 || undefined}
            title={countdownTitle}
          >
            {countdownText}
          </span>
        </span>
      </>
    )
    ariaLabel =
      locationSource === 'approx'
        ? `Air quality ${Math.round(reading.pm25)} PM2.5 near ${placeLabel} — approximate location, expand for details`
        : locationSource === 'default'
          ? `Air quality ${Math.round(reading.pm25)} PM2.5 near ${placeLabel} — not your location, expand for details`
          : `Air quality ${Math.round(reading.pm25)} PM2.5 near ${placeLabel}, expand for details`
  }

  return (
    <div
      ref={rootRef}
      className="aq-capsule"
      data-phase={phase}
      data-hidden={hidden || undefined}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <div ref={shellRef} className="aq-capsule__shell">
        <LiquidGlass as="div" variant={variant} radius={radius} className="aq-capsule__glass">
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
          {open && reading.status === 'ready' && (
            <div id={panelId} className="aq-capsule__panel">
              <CapsulePanel
                reading={reading}
                data={data}
                contentWidth={EXPANDED_W - PANEL_PAD * 2}
                placeLabel={placeLabel}
                locationSource={locationSource}
                requestingLocation={requesting}
                locationDenied={denied}
                onRequestLocation={requestGeolocation}
              />
            </div>
          )}
        </LiquidGlass>
      </div>
    </div>
  )
}
