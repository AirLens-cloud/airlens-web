import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import BandSlot from './BandSlot'

afterEach(() => cleanup())

describe('BandSlot', () => {
  it('renders a track with a p50 marker and the formatted range when the band is available', () => {
    // Arrange / Act
    const { container, getByRole } = render(<BandSlot available p10={30} p90={55} p50={40} unit="µg/m³" />)

    // Assert
    expect(container.querySelector('[data-band-state="available"]')).not.toBeNull()
    expect(container.querySelector('.band-slot__marker')).not.toBeNull()
    expect(container.textContent).toMatch(/30\.0–55\.0 µg\/m³/)
    expect(getByRole('img').getAttribute('aria-label')).toMatch(/30\.0 to 55\.0 µg\/m³, estimate 40\.0/)
  })

  it('omits the marker when no p50 is given, but still renders the range', () => {
    // Arrange / Act
    const { container } = render(<BandSlot available p10={10} p90={20} />)

    // Assert
    expect(container.querySelector('.band-slot__marker')).toBeNull()
    expect(container.textContent).toMatch(/10\.0–20\.0/)
  })

  it('renders a dashed bracket with a reason sentence when unavailable, never a blank', () => {
    // Arrange / Act
    const { container } = render(<BandSlot available={false} reason="deterministic source" emptyLabel="not published" />)

    // Assert
    expect(container.querySelector('[data-band-state="unavailable"]')).not.toBeNull()
    expect(container.querySelector('.band-slot__bracket')).not.toBeNull()
    expect(container.textContent).toMatch(/not published \(deterministic source\)/)
  })

  it('falls back to a generic empty label when no reason is given', () => {
    // Arrange / Act
    const { container } = render(<BandSlot available={false} />)

    // Assert
    expect(container.textContent).toMatch(/No band published/)
  })

  it('keeps the same two-row footprint whether the band is available or withheld (no layout jump)', () => {
    // Arrange / Act
    const available = render(<BandSlot available p10={10} p90={20} />)
    const unavailable = render(<BandSlot available={false} reason="n/a" />)

    // Assert — one visual row (track/bracket) + one text row (label/empty),
    // in both states — the actual pixel heights are set equal in
    // band-slot.css (`.band-slot__track`/`.band-slot__bracket` both 4px),
    // which jsdom cannot lay out, so this asserts the structural invariant.
    expect(available.container.querySelector('.band-slot')?.childElementCount).toBe(2)
    expect(unavailable.container.querySelector('.band-slot')?.childElementCount).toBe(2)
  })
})
