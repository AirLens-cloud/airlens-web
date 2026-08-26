import type { WfSegmentedProps } from './types'

/**
 * WfSegmented — multi-option toggle primitive (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfSegmented.tsx.
 *
 * Controlled — caller owns activeKey state.
 * CSS: src/styles/wireframe.css `.seg` / `.seg-item`.
 */
export default function WfSegmented({
  items,
  activeKey,
  onChange,
  className,
  ariaLabel,
}: WfSegmentedProps) {
  return (
    <div className={`seg${className ? ` ${className}` : ''}`} role="group" aria-label={ariaLabel}>
      {items.map((item) => {
        const button = (
          <button
            key={item.key}
            type="button"
            className={`seg-item${item.key === activeKey ? ' active' : ''}`}
            aria-pressed={item.key === activeKey}
            onClick={() => onChange(item.key)}
          >
            {item.label}
          </button>
        )
        if (!item.trailing) return button
        return (
          <span key={item.key} className="seg-item-wrap">
            {button}
            {item.trailing}
          </span>
        )
      })}
    </div>
  )
}
