/**
 * GlobeTimeline — frame picker for the PM2.5 forecast/analysis window.
 *
 * The monorepo drove this with a continuous `WfTimelineScrubber` track; that
 * composite is not in this repo's wireframe kit, and a continuous track would
 * anyway have to snap, because GEFS publishes discrete ±24h @ 3h frames and
 * nothing between them exists. So this renders the snap points themselves —
 * every button is a real published frame, plus NOW (offset 0, the live grid).
 *
 * Honest-degraded states, never a silent blank:
 *   - manifest still loading  → nothing rendered yet (the page owns that gate)
 *   - manifest absent / stale → the strip renders disabled with the reason
 */
import { useGlobeStore } from '../../../store/globeStore'
import LiquidGlass from '../../fluid/LiquidGlass'

function frameHHMM(validTime: string): string {
  return new Date(validTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function GlobeTimeline() {
  const frames = useGlobeStore((s) => s.timelineFrames)
  const stale = useGlobeStore((s) => s.timelineStale)
  const timeOffsetHours = useGlobeStore((s) => s.timeOffsetHours)
  const setTimeOffsetHours = useGlobeStore((s) => s.setTimeOffsetHours)

  const unavailable = stale || !frames || frames.length === 0

  if (unavailable) {
    return (
      <LiquidGlass variant="night" radius={0} className="globe-timeline is-disabled" as="section">
        <span className="gt-kicker" aria-hidden="true">PM2.5 · TIME</span>
        <p className="gt-notice">
          {stale
            ? 'Forecast frames are stale — showing the live grid only.'
            : 'Forecast frames unavailable — showing the live grid only.'}
        </p>
      </LiquidGlass>
    )
  }

  const sorted = [...frames].sort((a, b) => a.offsetHours - b.offsetHours)

  return (
    <LiquidGlass variant="night" radius={0} className="globe-timeline" as="section">
      <span className="gt-kicker" aria-hidden="true">PM2.5 · TIME</span>
      <div className="gt-frames" role="radiogroup" aria-label="Forecast frame">
        <button
          type="button"
          className={`gt-frame${timeOffsetHours === 0 ? ' is-active' : ''}`}
          role="radio"
          aria-checked={timeOffsetHours === 0}
          onClick={() => setTimeOffsetHours(0)}
        >
          <strong>NOW</strong>
          <small>live</small>
        </button>
        {sorted.map((frame) => (
          <button
            key={`${frame.cycle}:${frame.file}`}
            type="button"
            className={`gt-frame${timeOffsetHours === frame.offsetHours ? ' is-active' : ''}`}
            role="radio"
            aria-checked={timeOffsetHours === frame.offsetHours}
            aria-label={`${frame.offsetHours > 0 ? 'Forecast' : 'Past'} ${Math.abs(frame.offsetHours)} hours, valid ${frameHHMM(frame.validTime)}`}
            onClick={() => setTimeOffsetHours(frame.offsetHours)}
          >
            <strong>{frame.offsetHours > 0 ? `+${frame.offsetHours}` : frame.offsetHours}h</strong>
            <small>{frameHHMM(frame.validTime)}</small>
          </button>
        ))}
      </div>
      <p className="gt-caveat">GEFS single-member — each button is one published frame, never an interpolation.</p>
    </LiquidGlass>
  )
}
