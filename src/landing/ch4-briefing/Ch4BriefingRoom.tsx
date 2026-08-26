/**
 * Ch4BriefingRoom — Chapter 4 of the "full flight" landing: the dawn wipe from
 * the flight's void into the briefing room's paper surface, then the three
 * methodology instruments (Glass-box AI / Spatial Intelligence / Causal
 * Reasoning) revealed against the field report those instruments produced.
 *
 * No `three`/`@react-three/fiber` here on purpose — this chapter's own
 * `hasCanvasSlot: false` in `LandingFlight.tsx` is the contract, and this file
 * never imports either package (Canvas 2D/SVG/DOM only, per the Wave L4
 * brief). `AtmosphericBackground`, the `three`-free particle canvas other
 * pages use, is Chapter 5's territory, not this one's.
 *
 * Adapted from AirLens-platform apps/web `src/pages/Home.tsx`'s
 * `BriefingRoom` — the DispatchList (news) and PolicyLens (SDID choropleth)
 * halves of that source section are dropped (approved decision D4: this
 * chapter carries only the three instruments + the field-report letterhead,
 * not a news feed or a policy-impact widget neither of which this repo has
 * data plumbing for yet). `DawnReport`/`InkInstrument` are reused verbatim
 * (already ported for `/design`'s gallery) rather than rewritten.
 *
 * The dawn wipe itself is NOT the source's sliding `.dawn-paper` curtain
 * (`ObservatoryFlight.tsx`'s `translateY` handoff) — per the Wave L4 brief,
 * this port instead cross-fades the stage's own background/ink color between
 * `--obs-void`/`--obs-ink` and `--obs-paper`/`--obs-paper-ink` via one inline
 * custom property (`--ch4-wipe`), set on every progress change rather than
 * re-rendering a transform. Simpler, and it needs no extra DOM layer.
 */
import { useMemo, type CSSProperties } from 'react'
import DawnReport from '../../components/home/observatory/DawnReport'
import InkInstrument from '../../components/home/observatory/InkInstrument'
import WfPlaceholder from '../../components/wireframe/WfPlaceholder'
import WfDataState from '../../components/wireframe/WfDataState'
import LiquidGlass from '../../components/fluid/LiquidGlass'
import Materialize from '../../components/fluid/Materialize'
import { dataState } from '../../types/dataState'
import { useReducedMotion } from '../shared/perf/useReducedMotion'
import { useDawnBriefingData } from './useDawnBriefingData'
import type { InstrumentDef } from './types'
import './ch4-briefing.css'

const WIPE_END = 0.35

const INSTRUMENTS: InstrumentDef[] = [
  {
    idx: '01',
    kind: 'spark',
    heading: 'Glass-box AI',
    body: 'Every forecast ships with its own p10–p90 band and a DQSS grade (A–F). A number with no doubt attached is not one we publish.',
    source: 'DQSS v1.0 · station-averaged',
  },
  {
    idx: '02',
    kind: 'network',
    heading: 'Spatial Intelligence',
    body: 'Ground stations fused with ACAG V6 satellite retrievals and MAIAC AOD, resolved to a 1km × 1km grid, refreshed hourly.',
    source: 'stations + ACAG V6 + MAIAC AOD',
  },
  {
    idx: '03',
    kind: 'arc',
    heading: 'Causal Reasoning',
    body: 'Synthetic difference-in-differences estimates each policy’s effect (ATT) with a 95% confidence interval. Correlation is not the claim.',
    source: 'SDID v1.0 · permutation p-value',
  },
]

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export interface Ch4BriefingRoomProps {
  /** rAF-throttled chapter progress (0..1) from `useChapterProgress`. */
  progress: number
}

export default function Ch4BriefingRoom({ progress }: Ch4BriefingRoomProps) {
  const reduced = useReducedMotion()
  const state = useDawnBriefingData()

  const wipeT = reduced ? 1 : clamp01(progress / WIPE_END)
  const cardsP = clamp01((progress - WIPE_END) / (1 - WIPE_END))
  const cardReveal = useMemo(
    () =>
      INSTRUMENTS.map((_, i) => (reduced ? 1 : clamp01((cardsP - i * 0.26) / 0.42))),
    [cardsP, reduced],
  )

  if (state.status === 'error') {
    // Never a fabricated field report: the real reason is logged; the shared
    // "no data" panel is what renders (same swap Ch1/Ch2/Ch3 made).
    console.error('[ch4-briefing] data load failed:', state.error)
    return (
      <div className="ch4-stage ch4-stage--fallback obs-surface">
        <WfDataState state={dataState('error', { source: 'landing mirror snapshot' })} />
      </div>
    )
  }

  if (state.status === 'loading' || !state.data) {
    return (
      <div className="ch4-stage ch4-stage--fallback obs-surface">
        <WfPlaceholder label="Reading the overnight grid…" />
      </div>
    )
  }

  const { gridCells, peak, firesTotal, forecast } = state.data

  return (
    <div
      className="ch4-stage obs-surface"
      style={{ '--ch4-wipe': wipeT } as CSSProperties}
    >
      {/* Void-phase kicker — fades out as the paper takes over. Text borrowed
          from the source repo's own dawn-handoff stamp (ObservatoryFlight.tsx):
          the same beat, just cross-faded instead of slid into place. */}
      <div className="ch4-kicker" style={{ opacity: 1 - wipeT }} aria-hidden={wipeT >= 1}>
        <span className="ch4-kicker__m">OBSERVATION LOG → FIELD REPORT</span>
      </div>

      <div className="ch4-paper" style={{ opacity: wipeT }} aria-hidden={wipeT <= 0.05}>
        <div className="ch4-paper__head">
          {/* Wave 4 P3 — eyebrow band glass. Separate commit from the rest of
              this wave's changes so a visual regression here can be reverted
              alone. */}
          <LiquidGlass as="div" variant="day" radius={12} bezel={16} className="ch4-paper__eyebrow-glass">
            <span className="ch4-paper__eyebrow m-b">AFTER THE FLIGHT — THE BRIEFING ROOM</span>
          </LiquidGlass>
          <h2 className="ch4-paper__heading fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>
            How we see
          </h2>
          <p className="ch4-paper__sub fluid-enter" style={{ '--enter-i': 1 } as CSSProperties}>
            Three instruments. The method is the brand.
          </p>
        </div>

        {/* Wave 4 P1 — the field report "opens" as the reader scrolls past
            the wipe, instead of simply being present the whole time. */}
        <Materialize show={cardsP > 0.05} origin="top center">
          <DawnReport gridCells={gridCells} peak={peak} firesTotal={firesTotal} forecast={forecast} />
        </Materialize>

        <div className="ch4-cards">
          {INSTRUMENTS.map((inst, i) => (
            <article
              key={inst.idx}
              className="ch4-card"
              style={{ '--reveal': cardReveal[i] } as CSSProperties}
            >
              <InkInstrument kind={inst.kind} />
              <div className="ch4-card__idx m-b">INSTRUMENT {inst.idx}</div>
              <h3 className="ch4-card__heading">{inst.heading}</h3>
              <p className="ch4-card__body">{inst.body}</p>
              <div className="ch4-card__source m num">{inst.source}</div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
