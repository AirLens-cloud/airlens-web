/**
 * functions/_lib/data.ts — SSR data access over the HF live dataset (AAA).
 *
 * Ported from AirLens-platform apps/web `functions/_lib/data.test.ts` (Wave 1,
 * plan airlens-airlens-web-2-curious-chipmunk), rewired for this repo's data
 * plane: the source mocked `env.ASSETS.fetch` (same-origin static JSON); this
 * repo fetches the public HF live dataset directly, so these tests stub the
 * Workers-global `fetch` instead. `Env`/`request` are still threaded through
 * `fetchCountryData`'s signature-adjacent callers in `pageHandlers.ts` (the
 * `/index.html` shell is still same-origin), but the feed reads under test
 * here take no `env`/`request` — see `data.ts`'s module header for why.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchArticleBySlug,
  fetchBlogListForSeo,
  fetchBlogPostForSeo,
  fetchNewsListForSeo,
  fetchCountryImpact,
  fetchCountryData,
} from './data'
import { __resetNewsFeedCache } from '../../src/api/news'
import { __resetBlogFeedCache } from '../../src/api/blog'
import { HF_LIVE_BASE, POLICY_IMPACT_BASE } from '../../src/lib/config/dataSources'

const NEWS_FEED_URL = `${HF_LIVE_BASE}/news-data/articles.json`
const BLOG_FEED_URL = `${HF_LIVE_BASE}/blog-data/posts.json`
const POLICY_INDEX_URL = `${POLICY_IMPACT_BASE}/index.json`

function jsonResponse(payload: unknown): Response {
  return { ok: true, status: 200, json: async () => payload } as unknown as Response
}

const NOT_FOUND = { ok: false, status: 404, json: async () => { throw new Error('not json') } } as unknown as Response

/** Stubs global fetch to answer only the given exact URLs; everything else 404s. */
function stubFetch(files: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    return url in files ? jsonResponse(files[url]) : NOT_FOUND
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const NEWS = {
  count: 2,
  articles: [
    {
      slug: 'seoul-smog',
      title: 'Seoul smog',
      summary: 'A summary',
      source_name: 'Air Quality News',
      published_at: '2026-08-25T00:00:00Z',
      country_code: 'KR',
    },
    { slug: 'older', title: 'Older', summary: 'x', published_at: '2026-01-01T00:00:00Z' },
  ],
}

const BLOG = {
  count: 1,
  posts: [
    {
      slug: 'london-ulez',
      title: '런던 ULEZ',
      body_ko: '**무슨 일인가**\n\n본문이다.',
      topic: 'health',
      source_refs: ['https://airqualitynews.com/a'],
      published_at: '2026-08-26T00:39:00Z',
      written_by: 'airlens-writer',
    },
  ],
}

beforeEach(() => {
  __resetNewsFeedCache()
  __resetBlogFeedCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('news SSR reads', () => {
  it('returns the matching article for a slug', async () => {
    stubFetch({ [NEWS_FEED_URL]: NEWS })
    const article = await fetchArticleBySlug('seoul-smog')
    expect(article?.title).toBe('Seoul smog')
    expect(article?.country_code).toBe('KR')
  })

  it('returns null when the feed is not published (fetch fails)', async () => {
    stubFetch({})
    expect(await fetchArticleBySlug('seoul-smog')).toBeNull()
    expect(await fetchNewsListForSeo()).toBeNull()
  })

  it('lists newest first and caps at the requested limit', async () => {
    stubFetch({ [NEWS_FEED_URL]: NEWS })
    const rows = await fetchNewsListForSeo(1)
    expect(rows?.map((r) => r.slug)).toEqual(['seoul-smog'])
  })
})

describe('blog SSR reads', () => {
  it('maps a Korean-original post without inventing an English title', async () => {
    stubFetch({ [BLOG_FEED_URL]: BLOG })
    const post = await fetchBlogPostForSeo('london-ulez')
    expect(post?.title_ko).toBe('런던 ULEZ')
    expect(post?.title_en).toBeNull()
    expect(post?.dek_ko).toBe('본문이다.')
    expect(post?.source_refs).toEqual([
      { type: 'data', ref: 'https://airqualitynews.com/a', label: 'airqualitynews.com' },
    ])
  })

  it('keeps Korean-only posts in the list page (filtering on title_en would empty it)', async () => {
    stubFetch({ [BLOG_FEED_URL]: BLOG })
    const rows = await fetchBlogListForSeo()
    expect(rows?.map((r) => r.slug)).toEqual(['london-ulez'])
  })

  it('returns null when the feed is not published', async () => {
    stubFetch({})
    expect(await fetchBlogPostForSeo('london-ulez')).toBeNull()
    expect(await fetchBlogListForSeo()).toBeNull()
  })
})

describe('country impact — path guard', () => {
  it('refuses a country code that is not an ISO code, without touching fetch', async () => {
    // Arrange — the code comes from a feed row, i.e. untrusted input.
    const spy = stubFetch({})

    // Act
    const impact = await fetchCountryImpact('../../secrets/keys')

    // Assert
    expect(impact).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('country data — no per-policy list in this repo\'s feed', () => {
  it('builds a registry from the policy-impact index with an honestly empty policy list', async () => {
    stubFetch({
      [POLICY_INDEX_URL]: [
        { country: 'South Korea', countryCode: 'KR', region: 'Asia', flag: '🇰🇷', policyCount: 2, lastUpdated: '2026-08-01' },
      ],
    })
    const data = await fetchCountryData('kr')
    expect(data?.registry.countryName).toBe('South Korea')
    expect(data?.registry.totalPolicies).toBe(2)
    expect(data?.registry.policies).toEqual([])
    expect(data?.impact).toBeNull() // no policy-impact/KR.json stubbed → honest null, not a throw
  })

  it('returns null for a country absent from the index (falls back to the SPA shell)', async () => {
    stubFetch({ [POLICY_INDEX_URL]: [] })
    expect(await fetchCountryData('ZZ')).toBeNull()
  })
})
