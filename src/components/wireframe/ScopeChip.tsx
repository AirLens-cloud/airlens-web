/**
 * ScopeChip — 4-scope (p/r/t/pub) consent chip primitive.
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/ScopeChip.tsx.
 */

export type ScopeChipVariant = 'p' | 'r' | 't' | 'pub'

interface Props {
  variant: ScopeChipVariant
  active?: boolean
  label: string
  description: string
  /** When provided the chip becomes an interactive toggle (button + aria-pressed). */
  onToggle?: () => void
}

export default function ScopeChip({ variant, active = false, label, description, onToggle }: Props) {
  const stateClass = active ? 'wf-scope-chip--active' : 'wf-scope-chip--inactive'
  const className = `wf-scope-chip wf-scope-chip--${variant} ${stateClass}`

  if (onToggle) {
    return (
      <button
        type="button"
        className={className}
        onClick={onToggle}
        aria-pressed={active}
        aria-label={`${label}: ${description}`}
        data-scope={variant}
        data-active={active ? 'true' : 'false'}
      >
        <span className="wf-scope-chip__label">{label}</span>
        <span className="wf-scope-chip__description">{description}</span>
      </button>
    )
  }

  return (
    <span
      className={className}
      role="img"
      aria-label={`${label}: ${description}`}
      data-scope={variant}
      data-active={active ? 'true' : 'false'}
    >
      <span className="wf-scope-chip__label">{label}</span>
      <span className="wf-scope-chip__description">{description}</span>
    </span>
  )
}
