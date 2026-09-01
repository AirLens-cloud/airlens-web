// Learn is static content (page-specs/learn-guided-projects.md §4-C) — no
// hooks, no fetch. The two things this suite must pin down are the ones the
// spec calls non-negotiable: exactly the 5 approved projects render, and
// every card carries its mandatory caveat (a project with no caveat would
// read as an unqualified causal claim, which is exactly what the spec's
// "함정" column exists to prevent).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Learn from './Learn'

afterEach(() => {
  cleanup()
})

describe('Learn page', () => {
  it('renders exactly the 5 approved guided projects', () => {
    // Act
    const { container } = render(<Learn />)
    // Assert
    expect(container.querySelectorAll('.lrn-card').length).toBe(5)
  })

  it('renders a non-empty caveat on every project card', () => {
    // Act
    const { container } = render(<Learn />)
    const caveats = container.querySelectorAll('[data-testid="lrn-card-caveat"]')
    // Assert
    expect(caveats.length).toBe(5)
    caveats.forEach((node) => {
      expect(node.textContent?.trim().length).toBeGreaterThan(0)
    })
  })

  it('links each card to its required dataset rather than a not-yet-built /learn/:slug route', () => {
    // Act
    const { container } = render(<Learn />)
    const links = container.querySelectorAll('.lrn-card__link')
    // Assert
    expect(links.length).toBe(5)
    links.forEach((node) => {
      expect(node.getAttribute('href')).toBe('/datasets')
    })
  })

  it('renders the eyebrow signalling that step-by-step mode needs the Lab', () => {
    // Act
    const { getByText } = render(<Learn />)
    // Assert
    expect(getByText(/LAB REQUIRED FOR STEPS/)).toBeTruthy()
  })
})
