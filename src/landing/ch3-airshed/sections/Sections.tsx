// Ported from AirLens-platform apps/landing-lab
// `src/concepts/seoul/sections/Sections.tsx` (Wave L3, 2026-08-26).
//
// Deviations from the source (mirrors the calls Ch1's Sections.tsx made):
//  - `react-router-dom` is not installed in this repo, and the S4 CTA's three
//    links pointed at landing-lab-only routes (/atmos, /particulate, /guide)
//    that don't exist here — both the import and the links are dropped. S4 now
//    reads as a chapter-close beat: scrolling further is itself the call to
//    action for Chapter 4, so there is nothing left to link to or "back" out
//    of (same treatment Ch1's S4 gives "The story keeps flying.").
//  - Classnames are prefixed `ch3-` (was bare `.seoul__sec`/`.seoul__hud-frame`/...)
//    so this chapter's CSS can't collide with a sibling chapter's.
//  - `fmtSnapshot` rebound from the source's per-concept `format.ts` to this
//    repo's shared `../../shared/format` (already ported for Ch2's Readout).
//  - TODO(i18n): plain strings until this repo gains an i18n layer — the
//    source repo (landing-lab) has no i18n either, so this is not a
//    regression, just a note for whenever `apps/web`-style `useTranslation()`
//    lands here.
import type { CSSProperties } from 'react'
import type { SeoulData } from '../types'
import { useReducedMotion } from '../../shared/perf/useReducedMotion'
import { fmtSnapshot } from '../../shared/format'

const SECTION_NAMES = ['HERO', 'WEST SIDE', 'DOWNTOWN', 'EAST SIDE', 'ENTER']

function opacityFor(i: number, progress: number): number {
  const local = progress * 5 - i
  if (local < 0 || local >= 1) return 0
  const fadeIn = i === 0 ? 1 : Math.min(1, local * 4)
  const fadeOut = i === 4 ? 1 : Math.min(1, (1 - local) * 4)
  return Math.min(fadeIn, fadeOut)
}

const layer = (op: number): CSSProperties => ({ opacity: op, visibility: op < 0.01 ? 'hidden' : 'visible' })

export default function Sections({ progress, data }: { progress: number; data: SeoulData }) {
  const reduced = useReducedMotion()
  const sectionIdx = Math.min(4, Math.floor(progress * 5))
  const pmTime = fmtSnapshot(data.pm25.meta.timestamp)

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

  const west = [...data.districts].sort((a, b) => a.localCentroid[0] - b.localCentroid[0])[0]
  const highest = [...data.districts].sort((a, b) => b.pm25 - a.pm25)[0]

  return (
    <>
      <div className="ch3-hud-frame">
        <span className="ch3-hf-tl">AIRLENS · SEOUL AIRSHED</span>
        <span className="ch3-hf-tr">25 DISTRICTS · {pmTime}</span>
        <span className="ch3-hf-br">{SECTION_NAMES[sectionIdx]}</span>
      </div>

      {/* S0 HERO */}
      <section className="ch3-sec ch3-sec--center" style={layer(opacityFor(0, progress))}>
        <span className="ch3-sec__kicker">AIRLENS · SEOUL AIRSHED</span>
        <h1 className="ch3-sec__hero">The air over Seoul, one district at a time.</h1>
        <p className="ch3-sec__lede">
          Scroll to fly across the city. Haze is the real PM2.5 in this snapshot; the streaks are the
          actual wind moving it.
        </p>
        <p className="ch3-sec__cue">
          SCROLL <span className="ch3-sec__cue-arrow">↓</span>
        </p>
      </section>

      {/* S1 WEST SIDE */}
      <section className="ch3-sec ch3-sec--left" style={layer(op1)}>
        <span className="ch3-sec__kicker" style={enter(op1, 0)}>
          01 · WEST SIDE
        </span>
        <h2 className="ch3-sec__head" style={enter(op1, 1)}>
          {west.nameEng} reads {west.pm25.toFixed(1)} µg/m³.
        </h2>
        <p className="ch3-sec__caveat" style={enter(op1, 2)}>
          Interpolated from a 1° grid — the whole west side can share a single cell. A real signal,
          riding on a coarse instrument.
        </p>
      </section>

      {/* S2 DOWNTOWN */}
      <section className="ch3-sec ch3-sec--left" style={layer(op2)}>
        <span className="ch3-sec__kicker" style={enter(op2, 0)}>
          02 · DOWNTOWN
        </span>
        <h2 className="ch3-sec__head" style={enter(op2, 1)}>
          What moves it across the city.
        </h2>
        <p className="ch3-sec__body" style={enter(op2, 2)}>
          Surface wind (NOAA GFS) carries the haze from district to district. The streaks trace that
          field, colored by speed — sped up so the transport is visible at all.
        </p>
      </section>

      {/* S3 EAST SIDE */}
      <section className="ch3-sec ch3-sec--right" style={layer(op3)}>
        <span className="ch3-sec__kicker" style={enter(op3, 0)}>
          03 · EAST SIDE
        </span>
        <h2 className="ch3-sec__head" style={enter(op3, 1)}>
          {highest.nameEng} is the highest reading this snapshot.
        </h2>
        <p className="ch3-sec__caveat" style={enter(op3, 2)}>
          Every one of the 25 slabs has a row in the table alongside it — the 3D view is a picture
          of that table, not a second source.
        </p>
      </section>

      {/* S4 — chapter close. Scrolling further is the call to action; the
          source's ATMOS/PARTICULATE/GUIDE links pointed at landing-lab-only
          routes that don't exist in this flight, so they're dropped (same
          call Ch1's Sections.tsx made for its own S4). */}
      <section className="ch3-sec ch3-sec--center" style={layer(opacityFor(4, progress))}>
        <h2 className="ch3-sec__cta">Planet scale, or particle scale, or one city block.</h2>
        <p className="ch3-sec__cue">
          SCROLL FOR CHAPTER 4 <span className="ch3-sec__cue-arrow">↓</span>
        </p>
      </section>
    </>
  )
}
