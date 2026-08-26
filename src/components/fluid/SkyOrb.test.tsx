import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import SkyOrb from './SkyOrb'

beforeEach(() => {
  // jsdom in this repo's vitest config has no `matchMedia`/`canvas` package —
  // SkyOrb calls useReducedMotion() unconditionally, and its own draw effect
  // guards on `ctx` being null (same SSR-safe pattern as displacementMap.ts),
  // so no canvas polyfill is needed for this smoke coverage.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SkyOrb', () => {
  it('mounts and unmounts without throwing when a PM2.5 reading is present', () => {
    // Arrange / Act
    const { unmount, container } = render(<SkyOrb pm25={42} />)
    // Assert
    expect(container.querySelector('canvas')).not.toBeNull()
    unmount()
  })

  it('mounts and unmounts without throwing when the reading is missing (null)', () => {
    // Arrange / Act
    const { unmount, container } = render(<SkyOrb pm25={null} />)
    // Assert
    expect(container.querySelector('canvas')).not.toBeNull()
    unmount()
  })

  it('mounts under reduced motion without throwing', () => {
    // Arrange
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    // Act
    const { unmount } = render(<SkyOrb pm25={80} tier="low" />)
    // Assert
    unmount()
  })
})
