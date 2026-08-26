import { useRef, type KeyboardEvent } from 'react'
import type { WfTabsProps } from './types'

/**
 * WfTabs — accessible tab bar primitive (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfTabs.tsx.
 *
 * WAI-ARIA tabs pattern: role="tablist"/"tab", roving tabindex, Arrow/Home/End
 * navigation with wrapping.
 *
 * CSS: src/styles/wireframe.css `.wf-tabs` / `.wf-tabs__tab`.
 */
export default function WfTabs({ items, activeKey, onChange, className, ariaLabel }: WfTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const move = (nextIndex: number) => {
    const n = items.length
    const i = ((nextIndex % n) + n) % n
    onChange(items[i].key)
    tabRefs.current[i]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        move(index + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        move(index - 1)
        break
      case 'Home':
        e.preventDefault()
        move(0)
        break
      case 'End':
        e.preventDefault()
        move(items.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div className={`wf-tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={ariaLabel}>
      {items.map((item, index) => {
        const active = item.key === activeKey
        return (
          <button
            key={item.key}
            ref={(el) => {
              tabRefs.current[index] = el
            }}
            type="button"
            role="tab"
            id={`wf-tab-${item.key}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={`wf-tabs__tab${active ? ' active' : ''}`}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
