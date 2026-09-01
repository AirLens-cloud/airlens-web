// news feed reader (AAA). Pins: unavailable vs empty vs found-vs-not-found are
// distinct results, editorial trust is a source heuristic (never a data
// quality grade), and rows without slug/title are dropped rather than
// rendered broken.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchDispatchFeed, fetchArticleBySlug, __resetNewsFeedCache } from './news'

function mockFetch(response: { ok: boolean; status?: number; body?: unknown; throws?: boolean }) {
  const spy = vi.fn(async () => {
    if (response.throws) throw new Error('network down')
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.body,
    } as unknown as Response
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

beforeEach(() => {
  __resetNewsFeedCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const ROW_A = {
  slug: 'a', title: 'Article A', category: 'policy', source_name: 'Reuters',
  published_at: '2026-08-01T00:00:00Z', article_url: 'https://example.com/a',
}
const ROW_B = {
  slug: 'b', title: 'Article B', category: 'research', source_name: 'AirLens Team',
  published_at: '2026-08-02T00:00:00Z', article_url: 'https://example.com/b',
}

describe('fetchDispatchFeed', () => {
  it('returns unavailable when the fetch throws', async () => {
    mockFetch({ ok: false, throws: true })
    const result = await fetchDispatchFeed()
    expect(result.status).toBe('unavailable')
  })

  it('returns unavailable on a non-2xx response', async () => {
    mockFetch({ ok: false, status: 500 })
    const result = await fetchDispatchFeed()
    expect(result.status).toBe('unavailable')
  })

  it('returns empty (not unavailable) when the feed loads with zero rows', async () => {
    mockFetch({ ok: true, body: { articles: [] } })
    const result = await fetchDispatchFeed()
    expect(result.status).toBe('empty')
  })

  it('returns ready with newest-first articles and derived categories', async () => {
    mockFetch({ ok: true, body: { refTime: '2026-08-02T00:00:00Z', articles: [ROW_A, ROW_B] } })
    const result = await fetchDispatchFeed()
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.articles.map((a) => a.slug)).toEqual(['b', 'a']) // newest first
    expect(result.categories.sort()).toEqual(['policy', 'research'])
    expect(result.refTime).toBe('2026-08-02T00:00:00Z')
  })

  it('drops rows without a slug or a title', async () => {
    mockFetch({
      ok: true,
      body: { articles: [ROW_A, { title: 'No slug' }, { slug: 'no-title' }] },
    })
    const result = await fetchDispatchFeed()
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.articles).toHaveLength(1)
  })

  it('marks an AirLens-sourced row verified and everything else external by default', async () => {
    mockFetch({ ok: true, body: { articles: [ROW_A, ROW_B] } })
    const result = await fetchDispatchFeed()
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    const a = result.articles.find((x) => x.slug === 'a')!
    const b = result.articles.find((x) => x.slug === 'b')!
    expect(a.editorialTrust).toBe('external')
    expect(b.editorialTrust).toBe('verified')
  })
})

describe('fetchDispatchFeed — HTML-fragment summary (QA finding 2026-09-01)', () => {
  it('derives plain text from a summary that carries a raw HTML fragment, with no tags or entities left', async () => {
    mockFetch({
      ok: true,
      body: {
        articles: [
          {
            ...ROW_A,
            summary: '<p>Critically endangered species threatened.</p><a href="https://example.com">Read more</a>',
          },
        ],
      },
    })
    const result = await fetchDispatchFeed()
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    const summary = result.articles[0].summary!
    expect(summary).not.toMatch(/<|&lt;/)
    expect(summary).toBe('Critically endangered species threatened. Read more')
  })
})

describe('fetchArticleBySlug', () => {
  it('returns unavailable when the feed cannot be read', async () => {
    mockFetch({ ok: false, throws: true })
    const result = await fetchArticleBySlug('a')
    expect(result.status).toBe('unavailable')
  })

  it('returns not-found for a slug absent from a feed that loaded fine', async () => {
    mockFetch({ ok: true, body: { articles: [ROW_A] } })
    const result = await fetchArticleBySlug('does-not-exist')
    expect(result.status).toBe('not-found')
  })

  it('returns found with the mapped article for a matching slug', async () => {
    mockFetch({ ok: true, body: { articles: [ROW_A] } })
    const result = await fetchArticleBySlug('a')
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.article.title).toBe('Article A')
  })
})
