// NewsArticle page — slug-prop rendering, not-found vs unavailable distinction,
// honest missing-summary state, and DQSS-class absence (acceptance tests
// #1/#3/#5/#6 of dispatch-article-signal-desk.md §11).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, within } from '@testing-library/react'

vi.mock('../api/news', () => ({ fetchArticleBySlug: vi.fn() }))
// Evidence block does its own network calls (countrySeries/policy) — stubbed
// here so this suite stays focused on the article states themselves.
vi.mock('../components/content/ArticleEvidenceBlock', () => ({
  default: () => <div data-testid="evidence-stub" />,
}))
// ArticleStoryLinks (mockup gate G2) reads the same index — stubbed to an
// empty index so its own coverage lives in ArticleStoryLinks.test.tsx.
vi.mock('../api/policy', () => ({ fetchPolicyIndex: vi.fn().mockResolvedValue([]) }))

import { fetchArticleBySlug } from '../api/news'
import { fetchPolicyIndex } from '../api/policy'
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

beforeEach(() => {
  // resetAllMocks (below) clears the factory-level mockResolvedValue too, so
  // it's re-armed per test rather than relying on it surviving a reset.
  vi.mocked(fetchPolicyIndex).mockResolvedValue([])
})

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

  // UI Tier-1 P2-B — evidence-source chip on the detail page. The country
  // chip is suppressed here (`hideCountryChip`, review Major 1): the
  // mockup-gate-G2 band (ArticleStoryLinks, below) owns the country->profile
  // link surface on this page, so NewsCrossLinks would otherwise render a
  // second link to the same destination.
  it('renders the evidence-source chip from NewsCrossLinks, with its country chip suppressed', async () => {
    vi.mocked(fetchArticleBySlug).mockResolvedValue({
      status: 'found',
      article: article({ countryCode: 'KR', sourceName: 'Reuters' }),
    })
    const { container } = render(<NewsArticle slug="a" />)
    await screen.findByRole('heading', { name: 'Article A' })
    const chips = within(container.querySelector('.news-chips') as HTMLElement)
    expect(chips.getByText(/evidence: reuters/i)).toBeTruthy()
    expect(chips.queryByRole('link', { name: /south korea/i })).toBeNull()
  })

  // Review Major 1 — the two country-linking components on this page
  // (NewsCrossLinks + ArticleStoryLinks) must never both point a reader at
  // `/country/:code`; exactly one profile link should exist.
  it('renders exactly one country-profile link on the article detail page', async () => {
    vi.mocked(fetchArticleBySlug).mockResolvedValue({
      status: 'found',
      article: article({ countryCode: 'KR', sourceName: 'Reuters' }),
    })
    render(<NewsArticle slug="a" />)
    await screen.findByRole('heading', { name: 'Article A' })
    const profileLinks = screen
      .getAllByRole('link')
      .filter((el) => el.getAttribute('href') === '/country/KR')
    expect(profileLinks).toHaveLength(1)
    expect(profileLinks[0].closest('.article-story-links')).toBeTruthy()
  })

  // Mockup gate G2 — approved 2026-09-05.
  it('renders the ArticleStoryLinks country column, gated to one column when the policy index has no match', async () => {
    vi.mocked(fetchArticleBySlug).mockResolvedValue({
      status: 'found',
      article: article({ countryCode: 'KR' }),
    })
    vi.mocked(fetchPolicyIndex).mockResolvedValue([])
    const { container } = render(<NewsArticle slug="a" />)
    await screen.findByRole('heading', { name: 'Article A' })
    const band = within(container.querySelector('.article-story-links') as HTMLElement)
    expect(band.getByRole('link', { name: /south korea/i }).getAttribute('href')).toBe('/country/KR')
    await new Promise((r) => setTimeout(r, 0))
    expect(band.queryByText(/evidence dataset/i)).toBeNull()
  })

  it('does not render the ArticleStoryLinks band when the article has no country code', async () => {
    vi.mocked(fetchArticleBySlug).mockResolvedValue({
      status: 'found',
      article: article({ countryCode: null }),
    })
    const { container } = render(<NewsArticle slug="a" />)
    await screen.findByRole('heading', { name: 'Article A' })
    expect(container.querySelector('.article-story-links')).toBeNull()
  })
})
