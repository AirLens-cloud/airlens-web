/**
 * ViewModeSwitch — Globe / Map / Table renderer picker for the shared grid
 * payload. Fully presentational, like `AtmosphericModeRail`/`GlobeObsHud`:
 * the page owns the store read/write and the WebGL-fallback decision, this
 * only renders the three-button radiogroup + the "same fact" hint copy.
 *
 * Globe disables itself (with a reason) when the caller says WebGL2 isn't
 * available — same disabled+reason pattern as a lens the store can't render
 * (`AtmosphericModeRail`), not a hidden control that reads as a bug.
 */
import { useRef } from 'react'
import type { GlobeViewMode } from '../../../store/globeStore'

export interface ViewModeSwitchItem {
  id: GlobeViewMode
  label: string
  disabled?: boolean
  disabledReason?: string
}

export interface ViewModeSwitchProps {
  mode: GlobeViewMode
  items: ViewModeSwitchItem[]
  onSelect: (mode: GlobeViewMode) => void
  hint?: string
}

export default function ViewModeSwitch({
  mode,
  items,
  onSelect,
  hint = 'SAME PAYLOAD · SAME CURSOR — 3 VIEWS, ONE FACT',
}: ViewModeSwitchProps) {
  const enabled = items.filter((it) => !it.disabled)
  const buttonRefs = useRef(new Map<GlobeViewMode, HTMLButtonElement>())

  // Standard APG radiogroup pattern: arrow keys both move focus AND select
  // (this isn't a form that needs a separate "confirm" step), wrapping past
  // either end. Disabled items are skipped rather than landed on. Focus is
  // moved imperatively — `tabIndex` alone tells the *next* Tab-in where to
  // land, it doesn't drag the browser's current focus off the button the
  // user is still sitting on.
  const moveFocus = (fromId: GlobeViewMode, dir: 1 | -1) => {
    if (enabled.length === 0) return
    const at = enabled.findIndex((it) => it.id === fromId)
    const from = at === -1 ? 0 : at
    const next = enabled[(from + dir + enabled.length) % enabled.length]
    onSelect(next.id)
    buttonRefs.current.get(next.id)?.focus()
  }

  return (
    <div className="view-mode-switch">
      <div className="vms-buttons" role="radiogroup" aria-label="Globe view mode">
        {items.map(({ id, label, disabled, disabledReason }) => (
          <button
            key={id}
            ref={(el) => {
              if (el) buttonRefs.current.set(id, el)
              else buttonRefs.current.delete(id)
            }}
            type="button"
            className={`vms-btn${mode === id ? ' is-active' : ''}`}
            role="radio"
            aria-checked={mode === id}
            disabled={disabled}
            aria-label={disabled && disabledReason ? `${label} — ${disabledReason}` : label}
            tabIndex={mode === id ? 0 : -1}
            onClick={() => onSelect(id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                moveFocus(mode, 1)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                moveFocus(mode, -1)
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="vms-hint m" aria-hidden="true">{hint}</span>
    </div>
  )
}
