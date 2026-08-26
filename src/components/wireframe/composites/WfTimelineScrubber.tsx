import { useCallback, useEffect, useRef, useState } from 'react'

export interface WfTimelineScrubberStep {
  key: string
  label: string
  /** Optional aria-label override. */
  ariaLabel?: string
}

/**
 * Continuous drag-track mode — a numeric offset instead of a discrete step
 * key. `snapPoints` is the frame-honesty boundary: dragging always resolves
 * to one of these values, never an interpolated in-between position, so the
 * track can never render/land on a "frame" that doesn't actually exist.
 */
export interface WfTimelineScrubberTrackConfig {
  /** Inclusive numeric bounds of the drag track (e.g. -24..24 hours). */
  min: number
  max: number
  /** Current offset — controlled. */
  offset: number
  /** Real, currently-available snap points. Must be non-empty for the track to be interactive. */
  snapPoints: number[]
  /** Fired with the nearest snap point whenever the user drags (mouse/touch move + initial down). */
  onScrub: (offsetHours: number) => void
  /** Fired once when a drag gesture starts, before the first onScrub of that gesture. */
  onScrubStart?: () => void
  /** Fired once when a drag gesture ends (pointer up/touch end). */
  onScrubEnd?: () => void
  minLabel?: string
  maxLabel?: string
  /** Current-value readout (e.g. "Forecast - valid 14:00"). */
  valueLabel?: string
  disabled?: boolean
  /** Shown instead of the track when disabled (e.g. "Forecast data temporarily unavailable"). */
  disabledLabel?: string
}

/** Optional play/pause + speed controls rendered before the track (track mode only). */
export interface WfTimelineScrubberPlaybackConfig {
  playing: boolean
  onTogglePlay: () => void
  playAriaLabel: string
  speed: 1 | 2
  onToggleSpeed: () => void
  speedAriaLabel: string
  disabled?: boolean
}

/**
 * Discriminated on `track`: passing `track` switches to the continuous
 * drag-track mode; omitting it keeps the original discrete step-tablist mode.
 */
export type WfTimelineScrubberProps =
  | {
      track: WfTimelineScrubberTrackConfig
      playback?: WfTimelineScrubberPlaybackConfig
      ariaLabel?: string
      className?: string
      testId?: string
    }
  | {
      track?: undefined
      /** Steps — defaults to a Globe-style time bar: -24H / NOW / +12H / +24H */
      steps?: WfTimelineScrubberStep[]
      value: string
      onChange: (next: string) => void
      ariaLabel?: string
      className?: string
      testId?: string
    }

const DEFAULT_STEPS: WfTimelineScrubberStep[] = [
  { key: '-24h', label: '-24H' },
  { key: 'now', label: 'NOW' },
  { key: '+12h', label: '+12H' },
  { key: '+24h', label: '+24H' },
]

/**
 * Snaps `raw` to the nearest value in `points` — pure, no DOM/React.
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/composites/WfTimelineScrubber.tsx.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper, not a component
export function snapToNearest(points: number[], raw: number): number {
  let snapped = points[0] ?? raw
  let bestDist = Infinity
  for (const p of points) {
    const d = Math.abs(p - raw)
    if (d < bestDist) {
      bestDist = d
      snapped = p
    }
  }
  return snapped
}

/**
 * WfTimelineScrubber — time bar composite (paper/ink doctrine).
 * No external deps beyond React. Both modes ported near-verbatim.
 */
export default function WfTimelineScrubber(props: WfTimelineScrubberProps) {
  if (props.track) {
    return <TrackScrubber track={props.track} playback={props.playback} ariaLabel={props.ariaLabel} testId={props.testId} />
  }

  const { steps = DEFAULT_STEPS, value, onChange, ariaLabel, className, testId } = props
  const classes = ['wf-timeline-scrubber']
  if (className) classes.push(className)
  return (
    <div
      className={classes.join(' ')}
      role="tablist"
      aria-label={ariaLabel ?? 'Timeline scrubber'}
      data-testid={testId}
    >
      {steps.map((step) => {
        const isActive = step.key === value
        return (
          <button
            key={step.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={step.ariaLabel ?? step.label}
            className={`wf-timeline-step ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange(step.key)}
          >
            {step.label}
          </button>
        )
      })}
    </div>
  )
}

interface TrackScrubberProps {
  track: WfTimelineScrubberTrackConfig
  playback?: WfTimelineScrubberPlaybackConfig
  ariaLabel?: string
  testId?: string
}

/** Continuous drag-track. */
function TrackScrubber({ track, playback, ariaLabel, testId }: TrackScrubberProps) {
  const { min, max, offset, snapPoints, onScrub, onScrubStart, onScrubEnd, minLabel, maxLabel, valueLabel, disabled, disabledLabel } = track
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const span = max - min

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el || span <= 0 || snapPoints.length === 0) return
      const rect = el.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const raw = min + ratio * span
      onScrub(snapToNearest(snapPoints, raw))
    },
    [span, min, snapPoints, onScrub],
  )

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => updateFromClientX(e.clientX)
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) updateFromClientX(t.clientX)
    }
    const onUp = () => {
      setDragging(false)
      onScrubEnd?.()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
    }
  }, [dragging, updateFromClientX, onScrubEnd])

  const knobPct = span > 0 ? ((offset - min) / span) * 100 : 0
  const sliderAriaLabel = ariaLabel ?? 'Timeline offset'

  return (
    <>
      {playback && (
        <>
          <button
            type="button"
            className={`tl-play t-micro${playback.playing ? ' playing' : ''}`}
            onClick={playback.onTogglePlay}
            disabled={playback.disabled}
            aria-pressed={playback.playing}
            aria-label={playback.playAriaLabel}
          >
            {playback.playing ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            className="tl-speed t-micro"
            onClick={playback.onToggleSpeed}
            disabled={playback.disabled}
            aria-label={playback.speedAriaLabel}
          >
            {playback.speed}×
          </button>
        </>
      )}
      {minLabel != null && <span>{minLabel}</span>}
      {disabled ? (
        <div className="track disabled" aria-disabled="true" data-testid={testId}>
          {disabledLabel && <span className="timeline-notice">{disabledLabel}</span>}
        </div>
      ) : (
        <div
          ref={trackRef}
          data-testid={testId}
          className={`track${dragging ? ' dragging' : ''}`}
          onMouseDown={(e) => {
            // No snap points -> onScrub can never fire; don't enter a dead
            // "grabbing" drag state that visually reacts but does nothing.
            if (snapPoints.length === 0) return
            onScrubStart?.()
            setDragging(true)
            updateFromClientX(e.clientX)
          }}
          onTouchStart={(e) => {
            if (snapPoints.length === 0) return
            onScrubStart?.()
            setDragging(true)
            const touch = e.touches[0]
            if (touch) updateFromClientX(touch.clientX)
          }}
        >
          <div className="fill" style={{ width: `${knobPct}%` }} />
          <div
            className={`knob${dragging ? ' dragging' : ''}`}
            style={{ left: `${knobPct}%` }}
            role="slider"
            aria-label={sliderAriaLabel}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={offset}
          />
        </div>
      )}
      {valueLabel != null && <span className="now">{valueLabel}</span>}
      {maxLabel != null && <span className="end">{maxLabel}</span>}
    </>
  )
}
