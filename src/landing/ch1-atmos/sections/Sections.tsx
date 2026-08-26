// Ported from AirLens-platform apps/landing-lab
// `src/concepts/atmos/sections/Sections.tsx` (Wave L1, 2026-08-26).
//
// Deviations from the source (see Wave L1 report for the full list):
//  - `react-router-dom` is not installed in this repo (not part of the
//    porting brief) and the S4 CTA's three links pointed at landing-lab-only
//    routes (/field-notes, /particulate, /guide) that don't exist here either
//    — both are dropped. S4 now reads as a chapter-close beat: scrolling
//    further is itself the call to action for Chapter 2, so there is nothing
//    left to link to or "back" out of.
//  - Classnames are prefixed `ch1-` (was bare `.sec`/`.hud`/...) so this
//    chapter's CSS can't collide with a sibling chapter's (L2/L3) or the
//    site's own class names once this lands inside a bigger app.
//  - TODO(i18n): plain strings until this repo gains an i18n layer — the
//    source repo (landing-lab) has no i18n either, so this is not a
//    regression, just a note for whenever `apps/web`-style `useTranslation()`
//    lands here.
import type { CSSProperties } from 'react'
import type { AtmosData } from '../types'
import type { QualityTier } from '../../shared/perf/types'
import { useReducedMotion } from '../../shared/perf/useReducedMotion'
import { AQI_GRADE_HEX } from '../../shared/theme/config'
import { ATMOS } from '../theme'
import Sparkline from './Sparkline'

const SECTION_NAMES = ['HERO', 'THE INVISIBLE LAYER', 'FIRE & WIND', 'FORECAST', 'ENTER']

function opacityFor(i: number, progress: number): number {
  const local = progress * 5 - i
  if (local < 0 || local >= 1) return 0
  const fadeIn = i === 0 ? 1 : Math.min(1, local * 4)
  const fadeOut = i === 4 ? 1 : Math.min(1, (1 - local) * 4)
  return Math.min(fadeIn, fadeOut)
}

function fmtTime(ms: number): string {
  try {
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + 'Z'
  } catch {
    return 'unknown'
  }
}

const layer = (op: number): CSSProperties => ({
  opacity: op,
  visibility: op < 0.01 ? 'hidden' : 'visible',
})

export default function Sections({
  progress,
  data,
  tier,
}: {
  progress: number
  data: AtmosData
  tier: QualityTier
}) {
  const reduced = useReducedMotion()
  const pmTime = fmtTime(data.pm25.meta.timestamp)
  const sectionIdx = Math.min(4, Math.floor(progress * 5))

  // Staggered rise per child, driven by the section's own opacity so it is a pure
  // function of scroll (deterministic — no replay-on-toggle). Skipped when reduced.
  const enter = (op: number, i: number): CSSProperties => {
    if (reduced) return {}
    const e = Math.max(0, Math.min(1, op * 1.3 - i * 0.14))
    return { opacity: e, transform: `translateY(${((1 - e) * 13).toFixed(1)}px)` }
  }

  const op1 = opacityFor(1, progress)
  const op2 = opacityFor(2, progress)
  const op3 = opacityFor(3, progress)

  return (
    <>
      {/* HUD frame — cinematic instrument readouts */}
      <div className="ch1-hud">
        <span className="ch1-hud__tl">AIRLENS · ATMOS</span>
        <span className="ch1-hud__tr">
          {tier.toUpperCase()} · {data.points.count.toLocaleString()} pts
        </span>
        <span className="ch1-hud__bl">GEFS-AEROSOLS · PM2.5 {pmTime}</span>
        <span className="ch1-hud__br">{SECTION_NAMES[sectionIdx]}</span>
      </div>

      {/* S0 HERO */}
      <section className="ch1-sec ch1-sec--center" style={layer(opacityFor(0, progress))}>
        <h1 className="ch1-sec__hero">See the air<br />you breathe.</h1>
        <p className="ch1-sec__sub">
          {data.points.count.toLocaleString()} POINTS · PM2.5 SNAPSHOT {pmTime}
        </p>
        <p className="ch1-sec__cue">SCROLL <span className="ch1-sec__cue-arrow">↓</span></p>
      </section>

      {/* S1 INVISIBLE LAYER — hotspot numbers live on the globe (HotspotLeaders) */}
      <section className="ch1-sec ch1-sec--left" style={layer(op1)}>
        <span className="ch1-sec__kicker" style={enter(op1, 0)}>01 · THE INVISIBLE LAYER</span>
        <h2 className="ch1-sec__head" style={enter(op1, 1)}>Where the world can't breathe.</h2>
        <p className="ch1-sec__caveat" style={enter(op1, 2)}>
          Model surface PM2.5 (NOAA GEFS-Aerosols), snapshot {pmTime} — an exposure estimate, not a
          station measurement.
        </p>
      </section>

      {/* S2 FIRE & WIND */}
      <section className="ch1-sec ch1-sec--left" style={layer(op2)}>
        <span className="ch1-sec__kicker" style={enter(op2, 0)}>02 · FIRE & WIND</span>
        <h2 className="ch1-sec__head" style={enter(op2, 1)}>What moves it around.</h2>
        <p className="ch1-sec__body" style={enter(op2, 2)}>
          Surface winds (NOAA GFS) carry particulates across borders. Trails trace the tangent flow
          field, colored by speed.
        </p>
        <div className="ch1-windlegend" style={enter(op2, 3)}>
          <span className="ch1-windlegend__item">
            <span className="ch1-windlegend__sw" style={{ background: ATMOS.accent }} />
            CALM
          </span>
          <span className="ch1-windlegend__ramp" />
          <span className="ch1-windlegend__item">
            <span className="ch1-windlegend__sw" style={{ background: AQI_GRADE_HEX.MODERATE }} />
            ~14 m/s
          </span>
        </div>
        <p className="ch1-sec__mono" style={enter(op2, 4)}>
          FIRMS · {data.fires.total} active detections
          {data.fires.refTime ? ` (snapshot ${fmtTime(Date.parse(data.fires.refTime))})` : ''}
        </p>
      </section>

      {/* S3 FORECAST */}
      <section className="ch1-sec ch1-sec--right" style={layer(op3)}>
        <span className="ch1-sec__kicker" style={enter(op3, 0)}>03 · FORECAST</span>
        <h2 className="ch1-sec__head" style={enter(op3, 1)}>Tomorrow, with its doubt.</h2>
        <div className="ch1-sparks" style={enter(op3, 2)}>
          {data.tft.cities.slice(0, 3).map((c) => (
            <Sparkline key={c.name} city={c} />
          ))}
        </div>
        <p className="ch1-sec__caveat" style={enter(op3, 3)}>
          AirLens TFT forecast · every line carries its p10–p90 band, and the band's width is
          reported as measured. Never a bare number.
        </p>
      </section>

      {/* S4 — chapter close. Scrolling further is the call to action for Chapter
          2; there is no route to link to (or back out to) from inside the flight. */}
      <section className="ch1-sec ch1-sec--center" style={layer(opacityFor(4, progress))}>
        <h2 className="ch1-sec__cta">The story keeps flying.</h2>
        <p className="ch1-sec__cue">SCROLL FOR CHAPTER 2 <span className="ch1-sec__cue-arrow">↓</span></p>
      </section>
    </>
  )
}
