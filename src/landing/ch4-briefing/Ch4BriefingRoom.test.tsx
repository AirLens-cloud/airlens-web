// AAA smoke test for the pre-data-resolved path, same shape as
// `Ch3AirshedScene.test.tsx`: jsdom has no global `fetch`, so
// `useDawnBriefingData`'s fetch calls reject asynchronously — this test
// asserts the *synchronous* pre-fetch render (the loading placeholder), never
// a fabricated field report.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Ch4BriefingRoom from './Ch4BriefingRoom'

beforeEach(() => {
  // jsdom in this repo's vitest config has no `matchMedia` (see Ch2's own
  // smoke test) — this component calls `useReducedMotion()` unconditionally
  // before its loading/error branches, so the stub is needed here too.
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

describe('Ch4BriefingRoom — before data resolves', () => {
  it('renders the loading placeholder instead of a fabricated field report', () => {
    // Arrange / Act
    render(<Ch4BriefingRoom progress={0} />)
    // Assert
    const loading = screen.getByText(/reading the overnight grid/i)
    expect(loading.textContent).toMatch(/reading the overnight grid/i)
  })
})
