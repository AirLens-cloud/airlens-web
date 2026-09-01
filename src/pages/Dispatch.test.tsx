// Dispatch page — loading/ready/empty/unavailable states, ≤3-badge meta row
// contract, and the DQSS/EditorialTrust axis separation (acceptance tests
// #1/#2/#6 of dispatch-article-signal-desk.md §11).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('../api/news', () => ({ fetchDispatchFeed: vi.fn() }))
import { fetchDispatchFeed } from '../api/news'
import Dispatch from './Dispatch'
import type { NewsArticle } from '../types/news'

function article(overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    slug: 'a', title: 'Article A', summary: 'A summary.', summaryEn: null, summaryKo: null,
    sourceName: 'Reuters', sourceUrl: null, articleUrl: 'https://example.com/a',
    publishedAt: '2026-08-01T00:00:00Z', region: null, countryCode: 'KR', topic: null,
    imageUrl: null, category: 'policy', isTopStory: false, editorialTrust: 'external',
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('Dispatch page', () => {
  it('renders skeleton cards in the loading state without throwing', () => {
    vi.mocked(fetchDispatchFeed).mockReturnValue(new Promise(() => {})) // never resolves
    const { container } = render(<Dispatch />)
    expect(container.querySelector('[data-testid="dispatch-skeleton"]')).not.toBeNull()
  })

  it('renders an honest empty state when the feed loaded with zero articles', async () => {
    vi.mocked(fetchDispatchFeed).mockResolvedValue({ status: 'empty' })
    render(<Dispatch />)
    expect(await screen.findByText(/no articles have been published/i)).toBeTruthy()
  })

  it('renders an error banner (not a fabricated empty state) when the feed is unavailable', async () => {
    vi.mocked(fetchDispatchFeed).mockResolvedValue({ status: 'unavailable' })
    render(<Dispatch />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read/i)
  })

  it('renders card meta with at most 3 badges (category, source, date) plus a separate trust badge', async () => {
    vi.mocked(fetchDispatchFeed).mockResolvedValue({
      status: 'ready',
      articles: [article()],
      categories: ['policy'],
      refTime: null,
    })
    const { container } = render(<Dispatch />)
    await screen.findByText('Article A')
    const meta = container.querySelector('[data-testid="dispatch-card-meta"]')
    expect(meta?.querySelectorAll('.content-tag').length).toBeLessThanOrEqual(3)
    // Trust badge exists but lives outside the meta row.
    expect(meta?.querySelector('.content-trust')).toBeNull()
    expect(container.querySelector('.content-trust')).not.toBeNull()
  })

  it('never renders a DQSS badge class anywhere on the page (EditorialTrust ≠ DataQuality)', async () => {
    vi.mocked(fetchDispatchFeed).mockResolvedValue({
      status: 'ready',
      articles: [article()],
      categories: ['policy'],
      refTime: null,
    })
    const { container } = render(<Dispatch />)
    await screen.findByText('Article A')
    expect(container.querySelector('[class*="dqss"]')).toBeNull()
  })

  it('shows "no summary generated" with no fake summary text when summary is absent', async () => {
    vi.mocked(fetchDispatchFeed).mockResolvedValue({
      status: 'ready',
      articles: [article({ summary: null, summaryEn: null, summaryKo: null })],
      categories: ['policy'],
      refTime: null,
    })
    render(<Dispatch />)
    expect(await screen.findByText(/no summary generated — original link only/i)).toBeTruthy()
  })
})
