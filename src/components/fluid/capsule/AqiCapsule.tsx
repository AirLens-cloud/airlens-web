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
import { useLocationPersonalization } from '../../../hooks/useLocationPersonalization'
import { formatElapsed } from '../../../lib/home/whyNow'
import { haversineKm } from '../../../lib/today/nearestCity'

const CAPSULE_SPRING = { damping: 0.68, response: 0.38 }
const COLLAPSED_W = 220
// Taller than the pre-Tier-1 56px: the idle bar is now two rows (location
// label + warning on top, the reading below) so the capsule never shows a
// bare number with no location context — see AqiCapsule's header comment.
const COLLAPSED_H = 68
const EXPANDED_W = 320
const EXPANDED_H = 300
const PANEL_PAD = 20

/** Assumed forecast cadence — matches the publish cron behind the capsule's
 * source (`forecastSource.ts`: the HF CAMS forecast refreshes every 6h). It
 * was 3h while the capsule read the grid-snapshot mirror; leaving it there
 * after the source moved would flip the readout to "Xh ago" (data-stale)
 * halfway through every real refresh window, i.e. half the time on current
 * data. Purely a countdown display; never asserted as a live guarantee. */
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000
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
 * UI Tier-1 P1: reads the shared `useLocationPersonalization` choice (set
 * from the Home hero's "see air quality near me" / "search a location"
 * CTAs) so a visitor who personalizes on Home sees the same personalized
 * reading here on Today/Globe/Insights/Landing, not a second prompt. Before
 * that opt-in it falls back to the same `approx` (edge IP) point Home uses,
 * so the two surfaces never disagree about where the visitor is. Idle state
 * always shows a location label, badged by how the point was obtained: a
 * "NEAREST TO YOU" distance for an opt-in geolocation choice, nothing extra
 * for a searched city, "APPROXIMATE" for the IP guess, and "NOT YOUR
 * LOCATION" for the feed's "thickest air" fallback pick — that last number
 * is very unlikely to be the visitor's own air. The idle pill keeps that
 * short form (COLLAPSED_W is 220px — the fuller wording below doesn't fit);
 * the expanded panel spells it out as "NEAREST FEED CITY — NOT YOUR
 * LOCATION" where there's room.
 *
 * UI G1 (2026-09-05, approved mockup): the fallback/approximate states also
 * carry their own "Use my location" CTA directly on the expanded panel —
 * `requestGeolocation` from the same shared `useLocationPersonalization`
 * hook Home's hero CTA already calls, so a pick made here and a pick made
 * on Home write to (and read from) the identical store; there is no second,
 * capsule-only location state. No auto-prompt: the browser permission
 * dialog only fires from this button's own click, never on mount.
 */
export default function AqiCapsule({ variant = 'night' }: AqiCapsuleProps = {}): ReactNode {
  const { choice, approx, requesting, denied, requestGeolocation } = useLocationPersonalization()
  const point = choice ?? approx
  const personalizedLocation = point ? { lat: point.lat, lon: point.lon } : null
  // Same three-way honesty as the Home hero: an opt-in choice is the
  // visitor's own location, the edge's IP guess is only approximate, and
  // neither means this is the feed's thickest-air pick.
  const locationSource: 'user' | 'approx' | 'none' = choice ? 'user' : approx ? 'approx' : 'none'
  const data = useCapsuleData(personalizedLocation)
  // Distance from the visitor's own geolocation pick to the feed city it
  // resolved to — only meaningful for a real GPS/Wi-Fi fix (`source ===
  // 'geolocation'`), not a typed-in search pick (already an exact match to
  // whatever city the visitor chose) or the IP-approximate guess (not an
  // opt-in). `haversineKm` is the same great-circle helper `pickNearestCity`
  // already uses to resolve that city in the first place — no second
  // distance formula.
  const distanceKm =
    data.status === 'ready' && choice?.source === 'geolocation'
      ? haversineKm(choice.lat, choice.lon, data.lat, data.lon)
      : null
  const reducedMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [pulsing, setPulsing] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [scrolledAway, setScrolledAway] = useState(false)

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
  if (data.status === 'loading') {
    idle = <span className="aq-capsule__value">···</span>
    ariaLabel = 'Air quality loading, expand for details'
  } else if (data.status === 'missing') {
    idle = <span className="aq-capsule__value">NO FEED</span>
    ariaLabel = 'Air quality feed unavailable, expand for details'
  } else {
    const elapsed = nowTick - new Date(data.updatedAt).getTime()
    const remaining = REFRESH_INTERVAL_MS - elapsed
    idle = (
      <>
        <span className="aq-capsule__loc-row t-micro">
          <span className="aq-capsule__loc">{data.city}</span>
          {locationSource === 'approx' && <span className="aq-capsule__warn">APPROXIMATE</span>}
          {locationSource === 'none' && <span className="aq-capsule__warn">NOT YOUR LOCATION</span>}
          {locationSource === 'user' && distanceKm !== null && (
            <span className="aq-capsule__distance">NEAREST TO YOU · {Math.round(distanceKm)} KM</span>
          )}
        </span>
        <span className="aq-capsule__reading-row">
          <AqiDot tier={data.tier} size={10} />
          <span className="aq-capsule__value">{Math.round(data.current)}</span>
          <span className="aq-capsule__unit">µg/m³</span>
          <span className="aq-capsule__countdown" data-stale={remaining <= 0 || undefined}>
            {remaining > 0 ? formatCountdown(remaining) : formatElapsed(elapsed)}
          </span>
        </span>
      </>
    )
    ariaLabel =
      locationSource === 'user'
        ? `Air quality ${Math.round(data.current)} PM2.5 in ${data.city}, expand for details`
        : locationSource === 'approx'
          ? `Air quality ${Math.round(data.current)} PM2.5 in ${data.city} — approximate location, expand for details`
          : `Air quality ${Math.round(data.current)} PM2.5 in ${data.city} — not your location, expand for details`
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
          {open && data.status === 'ready' && (
            <div id={panelId} className="aq-capsule__panel">
              <CapsulePanel
                data={data}
                contentWidth={EXPANDED_W - PANEL_PAD * 2}
                locationSource={locationSource}
                distanceKm={distanceKm}
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
