/**
 * AtmosphericModeRail — the 5-mode lens selector rail. Ported from
 * AirLens-platform apps/web/src/components/globe/observatory/AtmosphericModeRail.tsx
 * as a fully presentational component: the source read `useGlobeStore` +
 * `ATMOSPHERIC_MODES` (with lucide-react icons) directly; this port takes an
 * `items` array + `onSelect` callback instead, and swaps lucide icons for a
 * plain mono glyph string (lucide-react is not a dependency in this repo).
 * react-i18next stripped — plain-English default props/labels are the
 * caller's responsibility via `items`.
 */
export interface AtmosphericModeRailItem {
  id: string
  number: string
  label: string
  detail: string
  /** Single-character (or short) mono glyph shown in place of a lucide icon. */
  glyph: string
  active: boolean
  disabled?: boolean
  ariaLabel?: string
}

export interface AtmosphericModeRailProps {
  items: AtmosphericModeRailItem[]
  onSelect: (id: string) => void
  ariaLabel?: string
  kicker?: string
}

export default function AtmosphericModeRail({
  items,
  onSelect,
  ariaLabel = 'Atmospheric data mode',
  kicker = 'LENS / 05',
}: AtmosphericModeRailProps) {
  return (
    <nav className="atmos-mode-rail" aria-label={ariaLabel}>
      <span className="atmos-mode-kicker" aria-hidden="true">{kicker}</span>
      <div className="atmos-mode-list">
        {items.map(({ id, number, glyph, label, detail, active, disabled, ariaLabel: itemAriaLabel }) => (
          <button
            key={id}
            type="button"
            className={`atmos-mode${active ? ' is-active' : ''}`}
            onClick={() => onSelect(id)}
            disabled={disabled}
            aria-pressed={active}
            aria-label={itemAriaLabel ?? detail}
          >
            <span className="atmos-mode-number">{number}</span>
            <span aria-hidden="true">{glyph}</span>
            <span className="atmos-mode-copy">
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <span className="atmos-mode-state" aria-hidden="true">
              {disabled ? '—' : active ? '●' : '○'}
            </span>
          </button>
        ))}
      </div>
    </nav>
  )
}
