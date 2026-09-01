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
  return (
    <div className="view-mode-switch">
      <div className="vms-buttons" role="radiogroup" aria-label="Globe view mode">
        {items.map(({ id, label, disabled, disabledReason }) => (
          <button
            key={id}
            type="button"
            className={`vms-btn${mode === id ? ' is-active' : ''}`}
            role="radio"
            aria-checked={mode === id}
            aria-pressed={mode === id}
            disabled={disabled}
            aria-label={disabled && disabledReason ? `${label} — ${disabledReason}` : label}
            onClick={() => onSelect(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="vms-hint m" aria-hidden="true">{hint}</span>
    </div>
  )
}
