/**
 * Datasets — both candidate products withheld (AAA).
 *
 * `Datasets.test.tsx`'s existing withheld-product test only fails the
 * country panel; the grid product still succeeds there because
 * `api/gridSnapshot.ts` caches its artifact fetch at module scope — once an
 * earlier test in that file resolves it, a later test in the same file would
 * see the cached success regardless of what its own mock returns (the same
 * class of problem `CountryProfile.citiesError.test.tsx` isolates for
 * `landing/shared/data/loaders.ts`'s `tft.json` cache). Kept in its own file
 * so vitest's per-file module isolation gives the grid fetch a cold cache,
 * making the true 2/2-withheld edge (`fetchDatasetCatalog`'s `withheldCount`
 * counting both candidates, and the page's empty-catalog honesty copy)
 * actually reachable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import Datasets from './Datasets'

function installFailingFetch() {
  const spy = vi.fn(async (url: string) => {
    // Both candidate products' only sources are unreachable in this test.
    if (url.includes('current-pm25-grid.json')) return { ok: false, status: 500 } as Response
    if (url.includes('index.json')) return { ok: false, status: 500 } as Response
    return { ok: false, status: 404 } as Response
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Datasets — both products withheld', () => {
  it('renders the honest empty-catalog state and counts both withheld, never a fabricated card', async () => {
    // Arrange
    installFailingFetch()
    // Act
    render(<Datasets />)
    // Assert
    await waitFor(() => expect(screen.getByTestId('datasets-empty')).toBeTruthy())
    expect(screen.queryByTestId('dataset-grid')).toBeNull()
    expect(screen.queryByTestId('dataset-card')).toBeNull()
    expect(screen.getByTestId('datasets-totals').textContent).toContain('2 withheld')
  })
})
