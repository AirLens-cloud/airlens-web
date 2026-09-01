// Blog index page — honest empty state and DQSS/reproducible-badge absence
// (acceptance tests #1/#6 of blog-field-notes.md §11).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('../api/blog', () => ({ fetchBlogFeed: vi.fn() }))
import { fetchBlogFeed } from '../api/blog'
import Blog from './Blog'
import type { BlogPostSummary } from '../types/blog'

function post(overrides: Partial<BlogPostSummary> = {}): BlogPostSummary {
  return {
    slug: 'p1', title: 'A Field Note', dek: 'A short dek.', topic: 'health',
    publishedAt: '2026-08-26T00:00:00Z', readingMin: 3, sourceRefsCount: 1,
    heroImage: null,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('Blog page', () => {
  it('renders synthetic-free empty state when the feed loaded with zero posts', async () => {
    vi.mocked(fetchBlogFeed).mockResolvedValue({ status: 'empty' })
    render(<Blog />)
    expect(await screen.findByText(/no field notes have been published/i)).toBeTruthy()
  })

  it('renders an error state distinct from empty when the feed is unavailable', async () => {
    vi.mocked(fetchBlogFeed).mockResolvedValue({ status: 'unavailable' })
    render(<Blog />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read/i)
  })

  it('renders a post card with no DataQuality/DQSS/reproducible badge class anywhere', async () => {
    vi.mocked(fetchBlogFeed).mockResolvedValue({ status: 'ready', posts: [post()] })
    const { container } = render(<Blog />)
    await screen.findByText('A Field Note')
    expect(container.querySelector('[class*="dqss"]')).toBeNull()
    expect(container.querySelector('[class*="reproduc"]')).toBeNull()
  })

  it('renders the gradient placeholder thumbnail when a post has no heroImage (Wave 4)', async () => {
    vi.mocked(fetchBlogFeed).mockResolvedValue({ status: 'ready', posts: [post()] })
    const { container } = render(<Blog />)
    await screen.findByText('A Field Note')
    expect(container.querySelector('.content-thumb--placeholder')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders the heroImage as the card thumbnail when present (Wave 4)', async () => {
    vi.mocked(fetchBlogFeed).mockResolvedValue({
      status: 'ready',
      posts: [
        post({
          heroImage: {
            url: 'https://example.com/photo.jpg',
            sourceName: 'Example News',
            sourceUrl: 'https://example.com/article',
            alt: null,
          },
        }),
      ],
    })
    const { container } = render(<Blog />)
    await screen.findByText('A Field Note')
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.com/photo.jpg')
  })
})
