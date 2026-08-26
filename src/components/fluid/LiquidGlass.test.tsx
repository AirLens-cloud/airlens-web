import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LiquidGlass from './LiquidGlass'
import { __resetGlassTierForTest } from './glassTier'

beforeEach(() => {
  __resetGlassTierForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
  __resetGlassTierForTest()
})

describe('LiquidGlass', () => {
  it('renders its children', () => {
    // Arrange / Act
    render(<LiquidGlass>hello glass</LiquidGlass>)
    // Assert
    expect(screen.getByText('hello glass')).toBeTruthy()
  })

  it('falls back to the tint tier class in this jsdom environment (no matchMedia/CSS.supports)', () => {
    // Arrange / Act
    const { container } = render(<LiquidGlass>content</LiquidGlass>)
    const surface = container.querySelector('.liquid-glass')
    // Assert
    expect(surface).not.toBeNull()
    expect(surface?.className).toContain('liquid-glass--tint')
    expect(surface?.className).toContain('liquid-glass--day')
  })

  it('applies the night variant class', () => {
    // Arrange / Act
    const { container } = render(<LiquidGlass variant="night">content</LiquidGlass>)
    const surface = container.querySelector('.liquid-glass')
    // Assert
    expect(surface?.className).toContain('liquid-glass--night')
  })
})
