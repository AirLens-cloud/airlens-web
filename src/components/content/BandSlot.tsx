import type { CSSProperties } from 'react'

/**
 * BandSlot — a p10-p90 uncertainty strip shared by every surface that carries
 * a range (Today/CountryProfile hero via `TrustLine` today; Insights CI can
 * adopt the same shape later — design-audit 2026-09-05 §7 #2). When the band
 * is unpublished it renders a dashed bracket + reason in the *same* footprint
 * as a real band, so the layout never jumps depending on which state loaded
 * (design-audit §1 #5).
 */
export interface BandSlotAvailable {
  available: true
  p10: number
  p90: number
  /** Point estimate to mark inside the band. Defaults to the midpoint when
   * omitted (no marker is drawn without either). */
  p50?: number | null
  unit?: string
}

export interface BandSlotUnavailable {
  available: false
  /** Why no band exists for this reading. */
  reason?: string
}

export type BandSlotProps = (BandSlotAvailable | BandSlotUnavailable) & {
  /** Sentence shown before the reason when unavailable. */
  emptyLabel?: string
  className?: string
}

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n))
}

export default function BandSlot(props: BandSlotProps) {
  const { emptyLabel = 'No band published', className } = props
  const classes = ['band-slot']
  if (className) classes.push(className)

  if (!props.available) {
    return (
      <div className={classes.join(' ')} data-band-state="unavailable">
        <div className="band-slot__bracket" aria-hidden="true" />
        <p className="band-slot__empty">
          {emptyLabel}
          {props.reason ? ` (${props.reason})` : ''}
        </p>
      </div>
    )
  }

  const { p10, p90, p50, unit } = props
  const span = p90 - p10
  const markerPct = p50 != null && span > 0 ? clampPct(((p50 - p10) / span) * 100) : null

  return (
    <div className={classes.join(' ')} data-band-state="available">
      <div
        className="band-slot__track"
        role="img"
        aria-label={`Uncertainty range ${p10.toFixed(1)} to ${p90.toFixed(1)}${unit ? ` ${unit}` : ''}${
          p50 != null ? `, estimate ${p50.toFixed(1)}` : ''
        }`}
      >
        <span className="band-slot__fill" />
        {markerPct != null && (
          <i className="band-slot__marker" style={{ left: `${markerPct}%` } as CSSProperties} />
        )}
      </div>
      <p className="band-slot__label">
        {p10.toFixed(1)}–{p90.toFixed(1)}
        {unit ? ` ${unit}` : ''}
      </p>
    </div>
  )
}
