// Lab must be fully inert while it's in feasibility review (spec §6 — the L0
// engine spike has not passed, so no query engine may ship). The load-bearing
// assertion here isn't "does it render" but "does nothing on this page act
// like a working control" — no native interactive element, and no anchor
// that would navigate anywhere.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Lab from './Lab'

afterEach(() => {
  cleanup()
})

describe('Lab page', () => {
  it('renders the feasibility-review badge and the 3-rail + drawer anatomy', () => {
    // Act
    const { container, getByText } = render(<Lab />)
    // Assert
    expect(getByText('FEASIBILITY REVIEW')).toBeTruthy()
    expect(container.querySelector('.lab-shell')).not.toBeNull()
    expect(container.querySelector('.lab-canvas')).not.toBeNull()
    expect(container.querySelector('.lab-drawer')).not.toBeNull()
  })

  it('renders all 6 left-rail filter categories and 5 right-rail inspector categories', () => {
    // Act
    const { container } = render(<Lab />)
    // Assert
    expect(container.querySelectorAll('.lab-rail--left .lab-rail-group').length).toBe(6)
    expect(container.querySelectorAll('.lab-rail--right .lab-rail-group').length).toBe(5)
  })

  it('has no native interactive elements anywhere on the page', () => {
    // Act
    const { container } = render(<Lab />)
    // Assert — real form/interactive elements would mean a control that
    // looks or behaves like it works before the engine spike has passed.
    expect(container.querySelectorAll('button, input, select, textarea, a[href]').length).toBe(0)
  })

  it('renders the Run query and Export CTAs as inert (no click handlers, reachable by keyboard)', () => {
    // Act
    const { getByTestId } = render(<Lab />)
    const run = getByTestId('lab-cta-run')
    const exportCta = getByTestId('lab-cta-export')
    // Assert
    expect(run.getAttribute('aria-disabled')).toBe('true')
    expect(run.getAttribute('tabindex')).toBe('0')
    expect(exportCta.getAttribute('aria-disabled')).toBe('true')
  })
})
