// blog feed reader (AAA). Pins: unavailable vs empty vs found-vs-not-found,
// dek/reading-min derived from body (never authored), unknown source_ref
// shapes dropped, unknown topic coerced to 'news-review' (never silently
// filed under a real bucket).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchBlogFeed, fetchBlogPostBySlug, __resetBlogFeedCache, __test } from './blog'

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
  __resetBlogFeedCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const REAL_POST = {
  slug: 'london-ulez-linked-to-improved-lung-growth-in-children',
  title: '런던 ULEZ 도입, 아동 폐 성장 속도를 높이다',
  body_ko: '**무슨 일인가**\n\n런던의 초저배출존 도입 이후 대기질이 개선되면서 폐 성장 속도가 빨라졌다는 연구 결과가 공개되었다.',
  topic: 'health',
  source_refs: ['https://airqualitynews.com/news/health-news/london-ulez'],
  published_at: '2026-08-26T00:39:00Z',
  written_by: 'airlens-writer',
}

describe('fetchBlogFeed', () => {
  it('returns unavailable when the fetch throws', async () => {
    mockFetch({ ok: false, throws: true })
    expect((await fetchBlogFeed()).status).toBe('unavailable')
  })

  it('returns empty when the feed loads with zero posts', async () => {
    mockFetch({ ok: true, body: { posts: [], count: 0 } })
    expect((await fetchBlogFeed()).status).toBe('empty')
  })

  it('returns ready with a mapped post using the real feed shape', async () => {
    mockFetch({ ok: true, body: { posts: [REAL_POST], count: 1 } })
    const result = await fetchBlogFeed()
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.posts).toHaveLength(1)
    expect(result.posts[0].slug).toBe(REAL_POST.slug)
    expect(result.posts[0].topic).toBe('health')
    expect(result.posts[0].sourceRefsCount).toBe(1)
    expect(result.posts[0].dek).not.toBeNull()
    expect(result.posts[0].readingMin).toBeGreaterThanOrEqual(1)
  })

  it('drops rows without a slug or a title', async () => {
    mockFetch({ ok: true, body: { posts: [REAL_POST, { title: 'no slug' }, { slug: 'no-title' }] } })
    const result = await fetchBlogFeed()
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.posts).toHaveLength(1)
  })
})

describe('fetchBlogPostBySlug', () => {
  it('returns unavailable when the feed cannot be read', async () => {
    mockFetch({ ok: false, throws: true })
    expect((await fetchBlogPostBySlug(REAL_POST.slug)).status).toBe('unavailable')
  })

  it('returns not-found for a slug absent from a feed that loaded fine', async () => {
    mockFetch({ ok: true, body: { posts: [REAL_POST] } })
    expect((await fetchBlogPostBySlug('does-not-exist')).status).toBe('not-found')
  })

  it('returns found with body/source_refs for a matching slug', async () => {
    mockFetch({ ok: true, body: { posts: [REAL_POST] } })
    const result = await fetchBlogPostBySlug(REAL_POST.slug)
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.post.bodyKo).toContain('런던')
    expect(result.post.sourceRefs).toEqual([
      { type: 'data', ref: REAL_POST.source_refs[0], label: 'airqualitynews.com' },
    ])
  })

  it('treats content-pending (empty body) as an honest null dek/reading-min, not a crash', async () => {
    mockFetch({ ok: true, body: { posts: [{ ...REAL_POST, body_ko: '' }] } })
    const result = await fetchBlogPostBySlug(REAL_POST.slug)
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.post.dek).toBeNull()
    expect(result.post.readingMin).toBeNull()
    expect(result.post.bodyKo).toBeNull() // empty string is not a real body — str() rejects it
  })
})

describe('mapPost — field derivation', () => {
  it('coerces an unrecognized topic to news-review rather than a real bucket', () => {
    const mapped = __test.mapPost({ ...REAL_POST, topic: 'not-a-real-topic' })
    expect(mapped?.topic).toBe('news-review')
  })

  it('drops a source_refs entry that is neither a URL string nor a {type,ref,label} object', () => {
    const refs = __test.mapSourceRefs(['not a url', { type: 'news' }, 42, null])
    expect(refs).toEqual([])
  })

  // Review finding 2026-09-01: the bare-string branch validates the URL
  // scheme (`/^https?:\/\//`), but the `{type,ref,label}` object branch
  // only checked `typeof ref === 'string'` — a `javascript:` URI in the
  // `type: 'data'` shape would pass through and reach `SourceRefsBlock`'s
  // `<a href target="_blank">`. Dropped, not rendered, per the "unknown
  // shapes dropped" contract this function already documents.
  it('drops a {type:"data"} source_refs entry whose ref is not an http(s) URL (e.g. javascript: URI)', () => {
    const refs = __test.mapSourceRefs([{ type: 'data', ref: 'javascript:alert(1)', label: 'click me' }])
    expect(refs).toEqual([])
  })

  it('keeps a {type:"news"} source_refs entry whose ref is a slug, not a URL (no scheme required)', () => {
    const refs = __test.mapSourceRefs([{ type: 'news', ref: 'some-article-slug', label: 'Related article' }])
    expect(refs).toEqual([{ type: 'news', ref: 'some-article-slug', label: 'Related article' }])
  })

  it('derives the dek from the opening paragraph, skipping a heading paragraph', () => {
    const excerpt = __test.deriveExcerpt('**무슨 일인가**\n\n실제 첫 문단입니다.')
    expect(excerpt).toBe('실제 첫 문단입니다.')
  })
})
