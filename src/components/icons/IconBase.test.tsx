// Smoke test for the title/aria-hidden branch every icon in this directory
// shares via IconSvg — decorative-by-default (aria-hidden, no role) unless a
// `title` is passed (role="img" + visible <title>), per IconBase.tsx's own doc.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { IconSvg } from './IconBase'

afterEach(cleanup)

describe('IconSvg — decorative vs. accessible-name branch', () => {
  it('is aria-hidden and has no role by default (decorative use next to visible text)', () => {
    // Arrange / Act
    const { container } = render(<IconSvg><circle cx={12} cy={12} r={4} /></IconSvg>)
    const svg = container.querySelector('svg') as SVGElement
    // Assert
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('role')).toBeNull()
    expect(svg.querySelector('title')).toBeNull()
  })

  it('exposes role="img" and a visible <title> when a title is given', () => {
    // Arrange / Act
    const { container } = render(<IconSvg title="Live data"><circle cx={12} cy={12} r={4} /></IconSvg>)
    const svg = container.querySelector('svg') as SVGElement
    // Assert
    expect(svg.getAttribute('aria-hidden')).toBeNull()
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.querySelector('title')?.textContent).toBe('Live data')
  })
})
