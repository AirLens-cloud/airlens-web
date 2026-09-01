/**
 * ViewModeSwitch — `role="radio"` uses `aria-checked`, not `aria-pressed`
 * (that's the toggle-button attribute, a different widget). Arrow keys must
 * both move focus and select, per the APG radiogroup pattern, skipping
 * disabled items and wrapping past either end (code review Minor-1,
 * 2026-09-01).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import ViewModeSwitch, { type ViewModeSwitchItem } from './ViewModeSwitch'
import type { GlobeViewMode } from '../../../store/globeStore'

afterEach(cleanup)

const ITEMS: ViewModeSwitchItem[] = [
  { id: 'globe', label: 'GLOBE' },
  { id: 'map', label: 'MAP' },
  { id: 'table', label: 'TABLE' },
]

function radio(label: string): HTMLButtonElement {
  return screen.getByRole('radio', { name: new RegExp(`^${label}`, 'i') }) as HTMLButtonElement
}

describe('ViewModeSwitch', () => {
  it('exposes selection through aria-checked, not aria-pressed (role="radio" is not a toggle button)', () => {
    // Arrange / Act
    render(<ViewModeSwitch mode="globe" items={ITEMS} onSelect={() => {}} />)
    // Assert
    expect(radio('GLOBE').getAttribute('aria-checked')).toBe('true')
    expect(radio('MAP').getAttribute('aria-checked')).toBe('false')
    expect(radio('GLOBE').hasAttribute('aria-pressed')).toBe(false)
  })

  it('roves tabindex to the checked item only, so Tab lands on the active view', () => {
    // Arrange / Act
    render(<ViewModeSwitch mode="map" items={ITEMS} onSelect={() => {}} />)
    // Assert
    expect(radio('GLOBE').tabIndex).toBe(-1)
    expect(radio('MAP').tabIndex).toBe(0)
    expect(radio('TABLE').tabIndex).toBe(-1)
  })

  it('ArrowRight selects and focuses the next item, wrapping past the last one', () => {
    // Arrange
    const onSelect = vi.fn<(mode: GlobeViewMode) => void>()
    render(<ViewModeSwitch mode="table" items={ITEMS} onSelect={onSelect} />)
    // Act
    fireEvent.keyDown(radio('TABLE'), { key: 'ArrowRight' })
    // Assert — wraps from the last item back to the first.
    expect(onSelect).toHaveBeenCalledWith('globe')
  })

  it('ArrowLeft selects and focuses the previous item, wrapping past the first one', () => {
    // Arrange
    const onSelect = vi.fn<(mode: GlobeViewMode) => void>()
    render(<ViewModeSwitch mode="globe" items={ITEMS} onSelect={onSelect} />)
    // Act
    fireEvent.keyDown(radio('GLOBE'), { key: 'ArrowLeft' })
    // Assert — wraps from the first item back to the last.
    expect(onSelect).toHaveBeenCalledWith('table')
  })

  it('skips a disabled item when arrowing past it', () => {
    // Arrange — Globe disabled (e.g. WebGL2 unavailable), current = Map.
    const items: ViewModeSwitchItem[] = [
      { id: 'globe', label: 'GLOBE', disabled: true, disabledReason: 'WebGL2 unavailable' },
      { id: 'map', label: 'MAP' },
      { id: 'table', label: 'TABLE' },
    ]
    const onSelect = vi.fn<(mode: GlobeViewMode) => void>()
    render(<ViewModeSwitch mode="map" items={items} onSelect={onSelect} />)
    // Act — from Map, ArrowLeft should skip disabled Globe and wrap to Table.
    fireEvent.keyDown(radio('MAP'), { key: 'ArrowLeft' })
    // Assert
    expect(onSelect).toHaveBeenCalledWith('table')
  })
})
