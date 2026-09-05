// ArticleStoryLinks — mockup gate G2 hairline band: country column always
// backed by the article's own fields, evidence column gated on the real
// published policy-impact index (never a fabricated dataset link).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

vi.mock('../../api/policy', () => ({ fetchPolicyIndex: vi.fn() }))

import { fetchPolicyIndex } from '../../api/policy'
import ArticleStoryLinks from './ArticleStoryLinks'
import type { NewsArticle } from '../../types/news'
import type { PolicyIndexEntry } from '../../types/policy'

function fixture(overrides: Partial<Pick<NewsArticle, 'countryCode' | 'region'>> = {}) {
  return { countryCode: 'KR', region: null, ...overrides }
}

function indexEntry(overrides: Partial<PolicyIndexEntry> = {}): PolicyIndexEntry {
  return {
    country: 'South Korea', countryCode: 'KR', region: 'Asia', flag: '🇰🇷',
    policyCount: 1, lastUpdated: '2026-08-26', ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('ArticleStoryLinks', () => {
  it('renders the country column with a profile link when the article carries a country code', async () => {
    // Arrange
    vi.mocked(fetchPolicyIndex).mockResolvedValue([])
    // Act
    render(<ArticleStoryLinks article={fixture({ countryCode: 'KR' })} />)
    // Assert
    const link = await screen.findByRole('link', { name: /south korea/i })
    expect(link.getAttribute('href')).toBe('/country/KR')
  })

  it('renders both columns when the country is present in the policy-impact index', async () => {
    // Arrange
    vi.mocked(fetchPolicyIndex).mockResolvedValue([indexEntry({ countryCode: 'KR' })])
    // Act
    render(<ArticleStoryLinks article={fixture({ countryCode: 'KR' })} />)
    // Assert
    const evidenceLink = await screen.findByRole('link', { name: /sdid policy-impact/i })
    expect(evidenceLink.getAttribute('href')).toBe('/country/KR#cat-policy-title')
    expect(screen.getByRole('link', { name: /^south korea/i })).toBeTruthy()
  })

  it('folds to one column when the country is absent from the policy-impact index', async () => {
    // Arrange
    vi.mocked(fetchPolicyIndex).mockResolvedValue([indexEntry({ countryCode: 'JP' })])
    // Act
    render(<ArticleStoryLinks article={fixture({ countryCode: 'KR' })} />)
    // Assert
    await screen.findByRole('link', { name: /south korea/i })
    await waitFor(() => expect(fetchPolicyIndex).toHaveBeenCalled())
    expect(screen.queryByText(/evidence dataset/i)).toBeNull()
  })

  it('renders nothing when the article has no country code (never a blank band)', () => {
    // Arrange
    // Act
    const { container } = render(<ArticleStoryLinks article={fixture({ countryCode: null })} />)
    // Assert
    expect(container.querySelector('.article-story-links')).toBeNull()
    expect(fetchPolicyIndex).not.toHaveBeenCalled()
  })

  it('folds to one column, without touching the country column, when the index fetch fails', async () => {
    // Arrange
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchPolicyIndex).mockResolvedValue([]) // fetchPolicyIndex itself never throws — a failed read already resolves to []
    // Act
    render(<ArticleStoryLinks article={fixture({ countryCode: 'KR' })} />)
    // Assert
    const link = await screen.findByRole('link', { name: /south korea/i })
    expect(link.getAttribute('href')).toBe('/country/KR')
    await waitFor(() => expect(fetchPolicyIndex).toHaveBeenCalled())
    expect(screen.queryByText(/evidence dataset/i)).toBeNull()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('renders a region meta line under the country link when the article carries one', async () => {
    // Arrange
    vi.mocked(fetchPolicyIndex).mockResolvedValue([])
    // Act
    render(<ArticleStoryLinks article={fixture({ countryCode: 'KR', region: 'East Asia' })} />)
    // Assert
    await screen.findByRole('link', { name: /south korea/i })
    expect(screen.getByText('East Asia')).toBeTruthy()
  })
})
