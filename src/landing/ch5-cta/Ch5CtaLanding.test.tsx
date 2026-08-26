// AAA smoke test: the CTA renders synchronously (no data gate for the
// tagline/button — only the provenance date resolves async), and the link
// target is the honest, real `/globe` placeholder, never a dead href.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Ch5CtaLanding from './Ch5CtaLanding'

beforeEach(() => {
  // jsdom in this repo's vitest config has no `matchMedia` (see Ch2's own
  // smoke test) — `AtmosphericBackground`'s two effects each call
  // `window.matchMedia()` unguarded, so the stub is needed here too.
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

describe('Ch5CtaLanding', () => {
  it('renders the CTA link to /globe', () => {
    // Arrange / Act
    render(<Ch5CtaLanding />)
    // Assert
    const link = screen.getByRole('link', { name: /explore the globe/i })
    expect(link.getAttribute('href')).toBe('/globe')
  })
})
