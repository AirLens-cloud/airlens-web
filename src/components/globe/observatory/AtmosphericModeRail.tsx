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
  /** 'vertical' (default) is the instrument-rail layout this component was
   *  ported for. 'horizontal' lays the same buttons out as a HUD tab strip —
   *  CSS-only reflow via the `.atmos-mode-rail--horizontal` modifier class
   *  (globe-stage.css), no markup branch — and relies on `title` (added
   *  below) instead of the visible `<small>` reason line, which horizontal
   *  space doesn't have room for. */
  orientation?: 'vertical' | 'horizontal'
}

export default function AtmosphericModeRail({
  items,
  onSelect,
  ariaLabel = 'Atmospheric data mode',
  kicker = 'LENS / 05',
  orientation = 'vertical',
}: AtmosphericModeRailProps) {
  return (
    <nav
      className={`atmos-mode-rail${orientation === 'horizontal' ? ' atmos-mode-rail--horizontal' : ''}`}
      aria-label={ariaLabel}
    >
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
            title={itemAriaLabel ?? detail}
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
