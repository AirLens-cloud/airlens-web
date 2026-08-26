/**
 * ScopeChipGroup — 4-scope chip group render.
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/ScopeChipGroup.tsx.
 */
import ScopeChip from './ScopeChip'

export interface ScopeChipGroupItem {
  variant: 'p' | 'r' | 't' | 'pub'
  active: boolean
  label: string
  description: string
  /** Optional — when set the chip renders as an interactive toggle. */
  onToggle?: () => void
}

interface Props {
  items: ScopeChipGroupItem[]
  ariaLabel: string
}

export default function ScopeChipGroup({ items, ariaLabel }: Props) {
  return (
    <div className="wf-scope-chip-group" role="group" aria-label={ariaLabel}>
      {items.map((item) => (
        <ScopeChip
          key={item.variant}
          variant={item.variant}
          active={item.active}
          label={item.label}
          description={item.description}
          onToggle={item.onToggle}
        />
      ))}
    </div>
  )
}
