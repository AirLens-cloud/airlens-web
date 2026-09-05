// AirLensMark — the nav logo glyph. The keyframes used to live in an
// inline <style> inside the SVG, which leaked "@keyframes alm-breathe…"
// into the logo link's accessible textContent (2026-09-05 live-render
// audit). They now live in src/styles/motion.css instead — this guards
// against the regression.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import AirLensMark from './AirLensMark'

afterEach(cleanup)

describe('AirLensMark — markup hygiene', () => {
  it('renders no <style> element inside the SVG', () => {
    // Arrange / Act
    const { container } = render(<AirLensMark />)
    // Assert
    expect(container.querySelector('style')).toBeNull()
  })

  it('has no textContent leaking CSS (keyframes/animation source)', () => {
    // Arrange / Act
    const { container } = render(<AirLensMark />)
    const svg = container.querySelector('svg') as SVGElement
    // Assert
    expect(svg.textContent).toBe('')
  })

  it('still animates each bar via the alm-breathe keyframe and the dot via alm-pulse', () => {
    // Arrange / Act
    const { container } = render(<AirLensMark />)
    // Assert
    const bars = container.querySelectorAll('.alm-bar')
    expect(bars.length).toBe(7)
    bars.forEach((bar) => {
      expect((bar as SVGElement).style.animation).toContain('alm-breathe')
    })
    const dot = container.querySelector('.alm-dot') as SVGElement
    expect(dot.style.animation).toContain('alm-pulse')
  })
})
