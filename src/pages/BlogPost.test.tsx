// BlogPost page — slug-prop rendering, not-found vs unavailable, DQSS/
// reproducible-badge absence and no reproduce-command rendering (acceptance
// tests #2/#6/#7 of blog-field-notes.md §11).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('../api/blog', () => ({ fetchBlogPostBySlug: vi.fn() }))
import { fetchBlogPostBySlug } from '../api/blog'
import BlogPost from './BlogPost'
import type { BlogPost as BlogPostType } from '../types/blog'

function post(overrides: Partial<BlogPostType> = {}): BlogPostType {
  return {
    slug: 'p1', title: 'A Field Note', dek: 'A short dek.', topic: 'health',
    publishedAt: '2026-08-26T00:00:00Z', readingMin: 3, sourceRefsCount: 1,
    heroImage: null,
    bodyKo: '본문 문단입니다.', bodyEn: null, writtenBy: 'airlens-writer',
    sourceRefs: [{ type: 'data', ref: 'https://example.com', label: 'example.com' }],
    video: null,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('BlogPost page', () => {
  it('renders the post named by the slug prop', async () => {
    vi.mocked(fetchBlogPostBySlug).mockResolvedValue({ status: 'found', post: post() })
    render(<BlogPost slug="p1" />)
    expect(await screen.findByText('A Field Note')).toBeTruthy()
    expect(fetchBlogPostBySlug).toHaveBeenCalledWith('p1')
  })

  it('renders 404 (not a crash) for an unknown slug', async () => {
    vi.mocked(fetchBlogPostBySlug).mockResolvedValue({ status: 'not-found' })
    render(<BlogPost slug="does-not-exist" />)
    expect(await screen.findByText(/post not found/i)).toBeTruthy()
  })

  it('renders an error state distinct from not-found when the archive is unavailable', async () => {
    vi.mocked(fetchBlogPostBySlug).mockResolvedValue({ status: 'unavailable' })
    render(<BlogPost slug="p1" />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read/i)
    expect(screen.queryByText(/post not found/i)).toBeNull()
  })

  it('renders explicit content-pending copy (title/meta kept) when the body is empty, no silent blank', async () => {
    vi.mocked(fetchBlogPostBySlug).mockResolvedValue({
      status: 'found',
      post: post({ bodyKo: null, bodyEn: null }),
    })
    render(<BlogPost slug="p1" />)
    expect(await screen.findByText('A Field Note')).toBeTruthy()
    expect(await screen.findByText(/still being prepared/i)).toBeTruthy()
  })

  it('renders no DQSS/reproducible badge class and no reproduce command anywhere', async () => {
    vi.mocked(fetchBlogPostBySlug).mockResolvedValue({ status: 'found', post: post() })
    const { container } = render(<BlogPost slug="p1" />)
    await screen.findByText('A Field Note')
    expect(container.querySelector('[class*="dqss"]')).toBeNull()
    expect(container.querySelector('[class*="reproduc"]')).toBeNull()
    expect(container.querySelector('code')).toBeNull()
  })

  // Wave 4 — media is fully optional. Existing (pre-Wave-4) posts carry
  // heroImage:null/video:null, and this pins that they render exactly like
  // before: no hero figure, no video iframe, no layout-shift-causing gap.
  it('renders no hero figure and no video iframe for a post with no media (null-media regression)', async () => {
    vi.mocked(fetchBlogPostBySlug).mockResolvedValue({ status: 'found', post: post() })
    const { container } = render(<BlogPost slug="p1" />)
    await screen.findByText('A Field Note')
    expect(container.querySelector('.blogpost-hero')).toBeNull()
    expect(container.querySelector('.blogpost-video')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('renders the attributed hero image with a caption linking to the source when present', async () => {
    vi.mocked(fetchBlogPostBySlug).mockResolvedValue({
      status: 'found',
      post: post({
        heroImage: {
          url: 'https://example.com/photo.jpg',
          sourceName: 'Example News',
          sourceUrl: 'https://example.com/article',
          alt: 'A smoggy skyline',
        },
      }),
    })
    const { container } = render(<BlogPost slug="p1" />)
    await screen.findByText('A Field Note')
    const img = container.querySelector('.blogpost-hero img')
    expect(img?.getAttribute('src')).toBe('https://example.com/photo.jpg')
    expect(img?.getAttribute('alt')).toBe('A smoggy skyline')
    const link = container.querySelector('.blogpost-hero__caption a')
    expect(link?.getAttribute('href')).toBe('https://example.com/article')
    expect(link?.textContent).toBe('Example News')
  })

  it('renders a video iframe with a youtube-nocookie embed src when a recognized video URL is present', async () => {
    vi.mocked(fetchBlogPostBySlug).mockResolvedValue({
      status: 'found',
      post: post({ video: { sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } }),
    })
    const { container } = render(<BlogPost slug="p1" />)
    await screen.findByText('A Field Note')
    const iframe = container.querySelector('.blogpost-video iframe')
    expect(iframe?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })

  it('renders no video iframe when the video URL is unrecognized (never embeds the raw URL)', async () => {
    vi.mocked(fetchBlogPostBySlug).mockResolvedValue({
      status: 'found',
      post: post({ video: { sourceUrl: 'https://example.com/not-a-real-video-host' } }),
    })
    const { container } = render(<BlogPost slug="p1" />)
    await screen.findByText('A Field Note')
    expect(container.querySelector('iframe')).toBeNull()
  })
})
