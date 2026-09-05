// Coverage for the 04-motion-system.md "모드 레일" upgrade: (1) a globe-icons.svg
// symbol id renders as <use>, while a literal glyph character (DesignGallery's
// mocks) still renders as plain text; (2) the shared sliding indicator mounts
// with axis-appropriate inline geometry for the active item, per orientation.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import AtmosphericModeRail, { type AtmosphericModeRailItem } from './AtmosphericModeRail'

afterEach(cleanup)

const items = (): AtmosphericModeRailItem[] => [
  { id: 'live', number: '01', label: 'LIVE', detail: 'Stations + current grid', glyph: 'mode-live', active: true },
  { id: 'forecast', number: '02', label: 'FORECAST', detail: 'Real GEFS frames', glyph: 'mode-forecast', active: false },
  { id: 'events', number: '03', label: 'EVENTS', detail: 'FIRMS fire detections', glyph: 'mode-events', active: false },
]

describe('AtmosphericModeRail — icon symbol vs. literal glyph', () => {
  it('renders a globe-icons.svg <use> for a mode-* symbol id', () => {
    // Arrange / Act
    const { container } = render(<AtmosphericModeRail items={items()} onSelect={() => {}} />)
    // Assert
    const use = container.querySelector('.atmos-mode-glyph-icon use')
    expect(use?.getAttribute('href')).toBe('/icons/globe-icons.svg#mode-live')
  })

  it('falls back to a plain text glyph for a non-symbol string (DesignGallery-style mock)', () => {
    // Arrange
    const literalItems: AtmosphericModeRailItem[] = [
      { id: 'live', number: '01', label: 'Live', detail: 'Current observations', glyph: '●', active: true },
    ]
    // Act
    const { container } = render(<AtmosphericModeRail items={literalItems} onSelect={() => {}} />)
    // Assert
    expect(container.querySelector('.atmos-mode-glyph-icon')).toBeNull()
    expect(container.querySelector('.atmos-mode')?.textContent).toContain('●')
  })
})

describe('AtmosphericModeRail — shared sliding indicator', () => {
  it('mounts a top/height indicator for the active item in the default vertical orientation', () => {
    // Arrange / Act
    const { container } = render(<AtmosphericModeRail items={items()} onSelect={() => {}} />)
    const indicator = container.querySelector('.atmos-mode-indicator') as HTMLElement
    // Assert
    expect(indicator).not.toBeNull()
    expect(indicator.style.top).not.toBe('')
    expect(indicator.style.height).not.toBe('')
    expect(indicator.style.left).toBe('')
    expect(indicator.style.width).toBe('')
  })

  it('mounts a left/width indicator when orientation="horizontal"', () => {
    // Arrange / Act
    const { container } = render(
      <AtmosphericModeRail items={items()} onSelect={() => {}} orientation="horizontal" />,
    )
    const indicator = container.querySelector('.atmos-mode-indicator') as HTMLElement
    // Assert
    expect(indicator).not.toBeNull()
    expect(indicator.style.left).not.toBe('')
    expect(indicator.style.width).not.toBe('')
    expect(indicator.style.top).toBe('')
    expect(indicator.style.height).toBe('')
  })

  it('renders no indicator when no item is active', () => {
    // Arrange
    const noneActive = items().map((item) => ({ ...item, active: false }))
    // Act
    const { container } = render(<AtmosphericModeRail items={noneActive} onSelect={() => {}} />)
    // Assert
    expect(container.querySelector('.atmos-mode-indicator')).toBeNull()
  })
})
