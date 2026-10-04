import type { WfSegmentedProps } from './types'

/**
 * Overflow behaviour for a row too wide for its container. Omitted = the
 * original single inline row that clips (`.seg`), which Today relies on.
 * - `wrap`   chips flow onto extra rows (`.seg--wrap`)
 * - `scroll` one row that swipes sideways with edge fades (`.seg--scroll`)
 */
export type WfSegmentedLayout = 'wrap' | 'scroll'

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
  layout,
}: WfSegmentedProps & { layout?: WfSegmentedLayout }) {
  const classes = ['seg', layout ? `seg--${layout}` : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <div className={classes} role="group" aria-label={ariaLabel}>
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
