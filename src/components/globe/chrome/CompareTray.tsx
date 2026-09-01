/**
 * CompareTray — A/B small-multiple strip (`evidence-rail-compare-tray.md`
 * §4.2). Fully presentational: the page computes `currentSlot` from whatever
 * the shared cursor (selection + mode + view model) currently focuses on and
 * owns the store's `compareSlots`/`pinCompareSlot`/`removeCompareSlot`; this
 * only renders the two slots and the pin control.
 *
 * Max 2 slots by contract — a 3rd pin replaces B, never silently drops the
 * request (the store enforces this; the tray just reflects it).
 */
import type { CompareSlot } from '../../../store/globeStore'
import { gradeToHex } from '../../../lib/globe/gradeColor'

export interface CompareTrayProps {
  slots: readonly [CompareSlot | null, CompareSlot | null]
  currentSlot: CompareSlot | null
  onPinCurrent: () => void
  onRemove: (index: 0 | 1) => void
}

function slotSummary(slot: CompareSlot): string {
  const value = slot.value != null ? `${slot.value.toFixed(1)} ${slot.unit}` : 'no value'
  return `${slot.label} · ${slot.timeLabel} · ${slot.layerLabel} ${value}`
}

export default function CompareTray({ slots, currentSlot, onPinCurrent, onRemove }: CompareTrayProps) {
  const [a, b] = slots
  const differentNature = !!a && !!b && a.nature !== b.nature
  // Zero pinned scenes: the A/B grid is nothing but two empty-state
  // placeholders, which as a G0 canvas overlay just eats space over the
  // sphere for no information. Collapsing to the header-only pill is a pure
  // function of the same `slots` prop the grid below already reads — no new
  // state, just less to render when there's nothing to show yet.
  const isEmpty = !a && !b

  return (
    <section className={`compare-tray${isEmpty ? ' is-empty' : ''}`} aria-label="Compare tray">
      <header className="ct-head">
        <span className="ct-kicker m" aria-hidden="true">COMPARE</span>
        <button
          type="button"
          className="ct-pin"
          disabled={!currentSlot}
          onClick={onPinCurrent}
        >
          + Pin current scene
        </button>
      </header>

      {!isEmpty && (
        <div className="ct-slots">
          {(['A', 'B'] as const).map((letter, index) => {
            const slot = index === 0 ? a : b
            if (!slot) {
              return (
                <div key={letter} className="ct-slot is-empty">
                  <span className="m">{letter} · EMPTY — PIN A SECOND SCENE (TIME OR PLACE) TO COMPARE</span>
                </div>
              )
            }
            return (
              <div key={letter} className="ct-slot">
                <span className="ct-swatch" style={{ background: gradeToHex(slot.grade) }} aria-hidden="true" />
                <div className="ct-slot-copy">
                  <strong>{letter} · {slot.label}</strong>
                  <span>{slotSummary(slot)}</span>
                </div>
                <button
                  type="button"
                  className="ct-remove"
                  aria-label={`Remove ${letter}`}
                  onClick={() => onRemove(index as 0 | 1)}
                >
                  Remove {letter}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {a && b && (
        <p className="ct-scale-lock m" aria-hidden="true">SCALE LOCKED — SAME LEGEND, BOTH SLOTS</p>
      )}
      {differentNature && (
        <p className="ct-caveat">Different data nature — {a!.nature} vs {b!.nature}. Values shown as published, not reconciled.</p>
      )}
    </section>
  )
}
