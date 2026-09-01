// HomeStoriesResearch — Stories half reuses `fetchBlogFeed` (no forked fetch
// logic, `Blog.test.tsx` mocking pattern) and the Research half is a static
// editorial teaser (no feed, no DataQuality/DQSS badge — spec §7 "값 렌더 없음").
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('../../api/blog', () => ({ fetchBlogFeed: vi.fn() }))
import { fetchBlogFeed } from '../../api/blog'
import HomeStoriesResearch from './HomeStoriesResearch'
import type { BlogPostSummary } from '../../types/blog'

function post(overrides: Partial<BlogPostSummary> = {}): BlogPostSummary {
  return {
    slug: 'p1',
    title: 'A Field Note',
    dek: 'A short dek.',
    topic: 'health',
    publishedAt: '2026-08-26T00:00:00Z',
    readingMin: 3,
    sourceRefsCount: 1,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('HomeStoriesResearch — Stories (blog feed)', () => {
  it('shows a loading skeleton before the feed resolves', () => {
    vi.mocked(fetchBlogFeed).mockReturnValue(new Promise(() => {})) // never resolves
    const { getByTestId } = render(<HomeStoriesResearch />)
    expect(getByTestId('home-stories-skeleton')).not.toBeNull()
  })

  it('renders up to 3 latest posts as links to /blog/:slug, most recent first as returned by the feed', async () => {
    vi.mocked(fetchBlogFeed).mockResolvedValue({
      status: 'ready',
      posts: [
        post({ slug: 'p1', title: 'First' }),
        post({ slug: 'p2', title: 'Second' }),
        post({ slug: 'p3', title: 'Third' }),
        post({ slug: 'p4', title: 'Fourth' }),
      ],
    })
    const { container } = render(<HomeStoriesResearch />)
    await screen.findByText('First')
    const links = container.querySelectorAll('.home-story-card__link')
    expect(links.length).toBe(3)
    expect(links[0].getAttribute('href')).toBe('/blog/p1')
    expect(screen.queryByText('Fourth')).toBeNull()
  })

  it('renders the honest empty state when zero posts are published — no synthetic card', async () => {
    vi.mocked(fetchBlogFeed).mockResolvedValue({ status: 'empty' })
    render(<HomeStoriesResearch />)
    expect(await screen.findByText(/no field notes have been published/i)).not.toBeNull()
  })

  it('renders a distinct failure state when the feed is unavailable, not the empty-state wording', async () => {
    vi.mocked(fetchBlogFeed).mockResolvedValue({ status: 'unavailable' })
    render(<HomeStoriesResearch />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read/i)
  })

  it('ships no DataQuality/DQSS/reproducible badge anywhere in the block (editorial surface, spec §7)', async () => {
    vi.mocked(fetchBlogFeed).mockResolvedValue({ status: 'ready', posts: [post()] })
    const { container } = render(<HomeStoriesResearch />)
    await screen.findByText('A Field Note')
    expect(container.querySelector('[class*="dqss"]')).toBeNull()
    expect(container.querySelector('[class*="reproduc"]')).toBeNull()
    expect(container.querySelector('[class*="data-quality"]')).toBeNull()
  })
})

describe('HomeStoriesResearch — Research (static teaser)', () => {
  it('renders the honest 0-published state and links to /research without fetching a research feed', () => {
    vi.mocked(fetchBlogFeed).mockReturnValue(new Promise(() => {}))
    const { container, getByText } = render(<HomeStoriesResearch />)
    expect(getByText(/0 published/i)).not.toBeNull()
    expect(getByText(/no receipts are published yet/i)).not.toBeNull()
    const researchLink = container.querySelector('.home-research__more')
    expect(researchLink?.getAttribute('href')).toBe('/research')
  })
})
