// NewsArticle page — slug-prop rendering, not-found vs unavailable distinction,
// honest missing-summary state, and DQSS-class absence (acceptance tests
// #1/#3/#5/#6 of dispatch-article-signal-desk.md §11).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('../api/news', () => ({ fetchArticleBySlug: vi.fn() }))
// Evidence block does its own network calls (countrySeries/policy) — stubbed
// here so this suite stays focused on the article states themselves.
vi.mock('../components/content/ArticleEvidenceBlock', () => ({
  default: () => <div data-testid="evidence-stub" />,
}))

import { fetchArticleBySlug } from '../api/news'
import NewsArticle from './NewsArticle'
import type { NewsArticle as NewsArticleType } from '../types/news'

function article(overrides: Partial<NewsArticleType> = {}): NewsArticleType {
  return {
    slug: 'a', title: 'Article A', summary: null, summaryEn: 'English summary.', summaryKo: null,
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

describe('NewsArticle page', () => {
  it('renders the article named by the slug prop', async () => {
    vi.mocked(fetchArticleBySlug).mockResolvedValue({ status: 'found', article: article() })
    render(<NewsArticle slug="a" />)
    // "Article A" also appears in the breadcrumb — the <h1> is the unambiguous target.
    expect(await screen.findByRole('heading', { name: 'Article A' })).toBeTruthy()
    expect(fetchArticleBySlug).toHaveBeenCalledWith('a')
  })

  it('renders a not-found state with a Back to Dispatch link for an unknown slug', async () => {
    vi.mocked(fetchArticleBySlug).mockResolvedValue({ status: 'not-found' })
    render(<NewsArticle slug="does-not-exist" />)
    expect(await screen.findByText(/article not found/i)).toBeTruthy()
    expect(screen.getByText(/back to dispatch/i).closest('a')?.getAttribute('href')).toBe('/dispatch')
  })

  it('renders an error banner (distinct from not-found) when the feed is unavailable', async () => {
    vi.mocked(fetchArticleBySlug).mockResolvedValue({ status: 'unavailable' })
    render(<NewsArticle slug="a" />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read/i)
    expect(screen.queryByText(/article not found/i)).toBeNull()
  })

  it('renders "summary not yet generated" with only the original link, never fake body text', async () => {
    vi.mocked(fetchArticleBySlug).mockResolvedValue({
      status: 'found',
      article: article({ summary: null, summaryEn: null, summaryKo: null }),
    })
    render(<NewsArticle slug="a" />)
    expect(await screen.findByText(/summary not yet generated/i)).toBeTruthy()
    // "read the original" also appears in the pending copy's own sentence —
    // the link's accessible name is the unambiguous target.
    const link = await screen.findByRole('link', { name: /read the original →/i })
    expect(link.getAttribute('href')).toBe('https://example.com/a')
  })

  it('never renders a DQSS badge class on the page', async () => {
    vi.mocked(fetchArticleBySlug).mockResolvedValue({ status: 'found', article: article() })
    const { container } = render(<NewsArticle slug="a" />)
    await screen.findByRole('heading', { name: 'Article A' })
    expect(container.querySelector('[class*="dqss"]')).toBeNull()
  })
})
