import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import StateChip from './StateChip'

afterEach(() => cleanup())

describe('StateChip', () => {
  it('renders each variant with its own modifier class and icon glyph (shape, not just color, differs)', () => {
    // Arrange / Act
    const stale = render(<StateChip variant="stale" />)
    const forecast = render(<StateChip variant="forecast" />)
    const analysis = render(<StateChip variant="analysis" />)
    const approximate = render(<StateChip variant="approximate" />)
    const withheld = render(<StateChip variant="withheld" />)
    const experimental = render(<StateChip variant="experimental" />)

    // Assert — modifier class present for every variant (border style hook)
    expect(stale.container.querySelector('.state-chip--stale')).not.toBeNull()
    expect(forecast.container.querySelector('.state-chip--forecast')).not.toBeNull()
    expect(analysis.container.querySelector('.state-chip--analysis')).not.toBeNull()
    expect(approximate.container.querySelector('.state-chip--approximate')).not.toBeNull()
    expect(withheld.container.querySelector('.state-chip--withheld')).not.toBeNull()
    expect(experimental.container.querySelector('.state-chip--experimental')).not.toBeNull()

    // Assert — only the variants with an icon glyph render one (forecast,
    // analysis and withheld are outline-only, per design-audit §7 #1)
    expect(stale.container.textContent).toMatch(/◷/)
    expect(approximate.container.textContent).toMatch(/~/)
    expect(experimental.container.textContent).toMatch(/△/)
    expect(forecast.container.textContent).not.toMatch(/[◷~△]/)
    expect(analysis.container.textContent).not.toMatch(/[◷~△]/)
    expect(withheld.container.textContent).not.toMatch(/[◷~△]/)
  })

  it('labels the analysis variant "Model analysis" — a source, not a warning', () => {
    // Arrange / Act
    const { container } = render(<StateChip variant="analysis" />)
    // Assert
    expect(container.textContent?.trim()).toBe('Model analysis')
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

  it('renders its own default label and modifier class for a bare analysis chip (no label override)', () => {
    // Arrange / Act — no `label` prop, so this is StateChip's own mapping,
    // not a string the test hands it.
    const { container } = render(<StateChip variant="analysis" />)

    // Assert
    expect(container.querySelector('.state-chip--analysis')).not.toBeNull()
    expect(container.textContent?.trim()).toBe('Model analysis')
  })

  it("lets a label override merge the analysis and stale states into one chip, keeping the STALE variant's own class and icon", () => {
    // Arrange / Act — HomeHero's analysis-primary merged chip: `variant`
    // stays 'stale' (drives class + icon) even though the label text reads
    // "Model analysis".
    const { container } = render(<StateChip variant="stale" label="Model analysis · Stale" detail="4h" />)

    // Assert — variant (not the label string) selects the modifier class...
    expect(container.querySelectorAll('.state-chip')).toHaveLength(1)
    expect(container.querySelector('.state-chip--stale')).not.toBeNull()
    expect(container.querySelector('.state-chip--analysis')).toBeNull()
    // ...and the icon glyph (stale's own '◷', independent of the label text)...
    expect(container.textContent).toMatch(/◷/)
    // ...and the detail is appended by StateChip's own space-join, not baked
    // into the label prop (removing the append would drop the trailing "4h").
    expect(container.textContent?.trim()).toBe('◷ Model analysis · Stale 4h')
  })

  it('exposes the stagger index as a CSS custom property for the entrance animation', () => {
    // Arrange / Act
    const { container } = render(<StateChip variant="withheld" index={2} />)
    const chip = container.querySelector('.state-chip') as HTMLElement

    // Assert
    expect(chip.style.getPropertyValue('--chip-i')).toBe('2')
  })
})
