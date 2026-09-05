import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import StateChip from './StateChip'

afterEach(() => cleanup())

describe('StateChip', () => {
  it('renders each variant with its own modifier class and icon glyph (shape, not just color, differs)', () => {
    // Arrange / Act
    const stale = render(<StateChip variant="stale" />)
    const forecast = render(<StateChip variant="forecast" />)
    const approximate = render(<StateChip variant="approximate" />)
    const withheld = render(<StateChip variant="withheld" />)
    const experimental = render(<StateChip variant="experimental" />)

    // Assert — modifier class present for every variant (border style hook)
    expect(stale.container.querySelector('.state-chip--stale')).not.toBeNull()
    expect(forecast.container.querySelector('.state-chip--forecast')).not.toBeNull()
    expect(approximate.container.querySelector('.state-chip--approximate')).not.toBeNull()
    expect(withheld.container.querySelector('.state-chip--withheld')).not.toBeNull()
    expect(experimental.container.querySelector('.state-chip--experimental')).not.toBeNull()

    // Assert — only the variants with an icon glyph render one (forecast and
    // withheld are outline-only, per design-audit §7 #1)
    expect(stale.container.textContent).toMatch(/◷/)
    expect(approximate.container.textContent).toMatch(/~/)
    expect(experimental.container.textContent).toMatch(/△/)
    expect(forecast.container.textContent).not.toMatch(/[◷~△]/)
    expect(withheld.container.textContent).not.toMatch(/[◷~△]/)
  })

  it('appends the detail after the label when given, and omits it when not', () => {
    // Arrange / Act
    const withDetail = render(<StateChip variant="stale" detail="19h" />)
    const withoutDetail = render(<StateChip variant="forecast" />)

    // Assert
    expect(withDetail.container.textContent).toMatch(/Stale 19h/)
    expect(withoutDetail.container.textContent?.trim()).toBe('Forecast')
  })

  it('lets a label override merge two states into one chip without losing either fact', () => {
    // Arrange / Act — the home-hero merged chip: stale styling, both states
    // in the text, elapsed time as detail (label budget: one chip, not two).
    const { container } = render(<StateChip variant="stale" label="Forecast · Stale" detail="3h" />)

    // Assert — exactly one chip, stale variant styling, all three facts present.
    expect(container.querySelectorAll('.state-chip')).toHaveLength(1)
    expect(container.querySelector('.state-chip--stale')).not.toBeNull()
    expect(container.textContent).toMatch(/Forecast · Stale 3h/)
  })

  it('exposes the stagger index as a CSS custom property for the entrance animation', () => {
    // Arrange / Act
    const { container } = render(<StateChip variant="withheld" index={2} />)
    const chip = container.querySelector('.state-chip') as HTMLElement

    // Assert
    expect(chip.style.getPropertyValue('--chip-i')).toBe('2')
  })
})
