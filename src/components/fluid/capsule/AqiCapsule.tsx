import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
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
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { NAV_DESKTOP, belowWidthQuery } from '../../../lib/breakpoints'
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
// W2 (F06/GTAB2, mockup B's "Suwon 22" header chip): below NAV_DESKTOP —
// wherever the nav is in its hamburger mode — the idle pill folds into a
// one-row chip that sits inside the nav bar; chrome.css places it between
// the wordmark and the nav's two buttons. The floating 220x68 pill covered
// each page's own first content there (the /today place heading, the /globe
// source label, the /insights country picker and freshness line — the last
// still at 769-1023, iPad portrait). Height =
// --control-h-md, the theme toggle beside it; width = the room left at the
// 360px floor (right offset 124 = pad 20 + 56 + 40 + 2x4 gaps; left edge
// 132 clears the wordmark's 119) — enough for "DEFAULT" and 3 digits.
const COMPACT_W = 104
const COMPACT_H = 40
// The open height before the panel is measured (and the fallback where it
// cannot be, e.g. jsdom): the effect below grows or shrinks the shell to the
// bar plus the panel's own content, which W1b's source lines made taller.
const EXPANDED_H = 300
const PANEL_PAD = 20
// Room kept below an open shell that has been capped to the viewport.
const VIEWPORT_GAP = 16

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
  const compact = useMediaQuery(belowWidthQuery(NAV_DESKTOP))
  const collapsedW = compact ? COMPACT_W : COLLAPSED_W
  const collapsedH = compact ? COMPACT_H : COLLAPSED_H

  const panelId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const userInteractedRef = useRef(false)
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alertKickoffRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const width = useSpring(collapsedW, CAPSULE_SPRING)
  const height = useSpring(collapsedH, CAPSULE_SPRING)

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
    width.set(next ? EXPANDED_W : collapsedW)
    height.set(next ? EXPANDED_H : collapsedH)
  }

  // Open height = the bar + the panel's measured content, capped so the shell
  // never runs past the bottom of the viewport (a landscape phone); a capped
  // panel scrolls inside itself (fluid-capsule.css). Re-fit whenever the
  // panel's content changes size — the CAMS outlook often lands after the
  // headline. 0 means not laid out (jsdom), so EXPANDED_H stays.
  const panelMounted = open && reading.status === 'ready'
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panelMounted || !panel) return
    function fit(): void {
      const shell = shellRef.current
      if (!panel || !shell || panel.scrollHeight === 0) return
      // The glass's own border sits inside the shell, outside the bar+panel.
      const border = shell.offsetHeight - (panel.parentElement?.clientHeight ?? shell.offsetHeight)
      const room = window.innerHeight - shell.getBoundingClientRect().top - VIEWPORT_GAP
      height.set(Math.max(collapsedH, Math.min(collapsedH + panel.scrollHeight + border, room)))
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(panel)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelMounted, collapsedH])

  // A rotation or resize across NAV_DESKTOP while collapsed re-sizes the idle
  // shape; an open panel keeps its size and collapses to the new one.
  useEffect(() => {
    if (open) return
    width.set(collapsedW)
    height.set(collapsedH)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsedW, collapsedH])

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

  // The compact chip is square like the nav it sits in (mockup B's chip is
  // a square hairline box); the floating pill stays round.
  const radius = open ? 20 : compact ? 0 : COLLAPSED_H / 2
  const phase = pulsing ? 'alerting' : open ? 'open' : 'idle'
  // Never actually hide while it's open or announcing an alert — only the
  // idle collapsed pill slides away. The compact chip never hides: it rides
  // the nav bar, which stays on screen, so it covers no content to begin with.
  const hidden = scrolledAway && !open && phase !== 'alerting' && !compact

  let idle: ReactNode
  let ariaLabel: string
  if (reading.status === 'ready') {
    // Shared by both idle shapes. The stale note matters most on the compact
    // chip, whose visible "STALE" tag this label replaces for screen readers.
    const pm = Math.round(reading.pm25)
    const staleNote = reading.stale ? ', stale reading' : ''
    ariaLabel =
      locationSource === 'approx'
        ? `Air quality ${pm} PM2.5 near ${placeLabel} — approximate location${staleNote}, expand for details`
        : locationSource === 'default'
          ? `Air quality ${pm} PM2.5 near ${placeLabel} — not your location${staleNote}, expand for details`
          : `Air quality ${pm} PM2.5 near ${placeLabel}${staleNote}, expand for details`
  } else {
    ariaLabel =
      reading.status === 'loading'
        ? 'Air quality loading, expand for details'
        : 'Air quality feed unavailable, expand for details'
  }
  if (reading.status === 'loading') {
    idle = <span className="aq-capsule__value">···</span>
  } else if (reading.status === 'unavailable') {
    idle = <span className="aq-capsule__value">NO FEED</span>
  } else if (compact) {
    // One slot beside the number says why to doubt it, most urgent first:
    // a stale reading is not the air now for anyone; the Seoul default is
    // not the visitor's place; "~" marks the IP guess (mockup B's "~ Seoul"
    // eyebrow); otherwise the place itself, city only. The full place, badge
    // and freshness are one tap away in the panel, and in the aria-label.
    const tag = reading.stale ? 'STALE' : locationSource === 'default' ? 'DEFAULT' : null
    idle = (
      <span className="aq-capsule__chip">
        <AqiDot tier={reading.tier} size={8} />
        {tag !== null ? (
          <span className="aq-capsule__warn">{tag}</span>
        ) : (
          <span className="aq-capsule__chip-place">
            {locationSource === 'approx' ? '~' : ''}
            {placeLabel.split(',')[0]}
          </span>
        )}
        <span className="aq-capsule__value">{Math.round(reading.pm25)}</span>
      </span>
    )
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
  }

  return (
    <div
      ref={rootRef}
      className="aq-capsule"
      data-phase={phase}
      data-hidden={hidden || undefined}
      data-compact={compact || undefined}
      // The idle bar keeps its collapsed height once open, so the panel
      // mounts below it instead of under a trigger stretched to the shell.
      style={{ '--aq-capsule-bar-h': `${collapsedH}px` } as CSSProperties}
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
            <div id={panelId} ref={panelRef} className="aq-capsule__panel">
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
