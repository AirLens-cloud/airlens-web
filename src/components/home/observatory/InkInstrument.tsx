/**
 * InkInstrument — the three card-top SVG instruments in the briefing room: a
 * polyline spark, a node-network graph, and a dual arc (solid observed /
 * dashed counterfactual). Ported verbatim from
 * AirLens-platform apps/web/src/components/home/observatory/InkInstrument.tsx,
 * with the source's `React.JSX.Element` global-namespace return type replaced
 * by an explicit `import type { JSX }` — this repo's stricter TS setup does
 * not reliably resolve the bare `React.JSX` global. Static SVG, no WebGL;
 * colour stays token-driven via CSS classes (observatory.css), never a
 * literal hex on the SVG elements themselves.
 */
import type { JSX } from 'react'

export type InkInstrumentKind = 'spark' | 'network' | 'arc'

function SparkInstrument() {
  return (
    <svg viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        className="ink-inst__line"
        points="0,38 22,30 44,34 66,18 88,24 110,10 132,20 154,8 176,16 200,6"
      />
      <line className="ink-inst__base" x1="0" y1="43" x2="200" y2="43" />
    </svg>
  )
}

function NetworkInstrument() {
  return (
    <svg viewBox="0 0 200 44" aria-hidden="true">
      <g className="ink-inst__net">
        <line x1="30" y1="22" x2="90" y2="12" />
        <line x1="90" y1="12" x2="150" y2="26" />
        <line x1="150" y1="26" x2="185" y2="14" />
        <circle cx="30" cy="22" r="2.5" />
        <circle cx="90" cy="12" r="2.5" />
        <circle cx="150" cy="26" r="2.5" />
        <circle cx="185" cy="14" r="2.5" />
      </g>
    </svg>
  )
}

function ArcInstrument() {
  return (
    <svg viewBox="0 0 200 44" aria-hidden="true">
      <path className="ink-inst__arc-observed" d="M10,40 C60,40 80,10 190,12" />
      <path className="ink-inst__arc-counterfactual" d="M10,40 C60,38 90,26 190,30" />
    </svg>
  )
}

const KINDS: Record<InkInstrumentKind, () => JSX.Element> = {
  spark: SparkInstrument,
  network: NetworkInstrument,
  arc: ArcInstrument,
}

export default function InkInstrument({ kind }: { kind: InkInstrumentKind }) {
  const Instrument = KINDS[kind]
  return (
    <div className="ink-inst">
      <Instrument />
    </div>
  )
}
