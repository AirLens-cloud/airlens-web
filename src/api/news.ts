/**
 * News / Dispatch feed reader — `news-data/articles.json` on the HF live
 * dataset (`Robeedau/airlens-live`). Single tier, like `api/policy.ts`: no
 * bundled static fallback exists in this repo (there was never a monorepo
 * `apps/web/public/data/news/` mirror committed here to fall back to, and
 * inventing one would be a fixture that goes stale the moment the live feed
 * moves on) — a failed read renders the honest `unavailable` state instead.
 *
 * `EditorialTrust` is a publisher-trust heuristic, adapted from the
 * monorepo's `Dispatch.tsx` `authorToTrust()` (`source_name` in place of
 * `author` — this feed carries no author field). It never touches a data
 * value's quality, and it is not the same 3-value set as anything else in
 * this repo — see `types/news.ts`.
 */
import { HF_LIVE_BASE } from '../lib/config/dataSources'
import { logger } from '../lib/logger'
import type { ArticleLookupResult, DispatchFeedResult, EditorialTrust, NewsArticle } from '../types/news'

const NEWS_FEED_URL = `${HF_LIVE_BASE}/news-data/articles.json`

interface RawNewsRow {
  slug?: unknown
  title?: unknown
  summary?: unknown
  source_name?: unknown
  source_url?: unknown
  article_url?: unknown
  published_at?: unknown
  region?: unknown
  country_code?: unknown
  topic?: unknown
  image_url?: unknown
  category?: unknown
  summary_en?: unknown
  summary_ko?: unknown
  is_top_story?: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function computeEditorialTrust(row: RawNewsRow): EditorialTrust {
  const source = (str(row.source_name) ?? '').toLowerCase()
  if (source.includes('airlens')) return 'verified'
  if (source.includes('community') || source.includes('user-submitted')) return 'community'
  return 'external'
}

function mapRow(row: RawNewsRow): NewsArticle | null {
  const slug = str(row.slug)
  const title = str(row.title)
  if (!slug || !title) return null // no slug -> no detail route, no title -> nothing to render
  return {
    slug,
    title,
    summary: str(row.summary),
    summaryEn: str(row.summary_en),
    summaryKo: str(row.summary_ko),
    sourceName: str(row.source_name),
    sourceUrl: str(row.source_url),
    articleUrl: str(row.article_url),
    publishedAt: str(row.published_at),
    region: str(row.region),
    countryCode: str(row.country_code),
    topic: str(row.topic),
    imageUrl: str(row.image_url),
    category: str(row.category),
    isTopStory: row.is_top_story === true,
    editorialTrust: computeEditorialTrust(row),
  }
}

function byPublishedDesc(a: NewsArticle, b: NewsArticle): number {
  const ta = a.publishedAt ? Date.parse(a.publishedAt) : NaN
  const tb = b.publishedAt ? Date.parse(b.publishedAt) : NaN
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
  if (Number.isNaN(ta)) return 1
  if (Number.isNaN(tb)) return -1
  return tb - ta
}

let feedCache: { articles: NewsArticle[]; refTime: string | null } | null = null

/** Test seam — drops the in-memory feed cache. */
export function __resetNewsFeedCache(): void {
  feedCache = null
}

/**
 * Reads + parses the feed once per session. Returns `null` when the feed
 * could not be read at all (network failure, non-2xx, malformed payload) —
 * distinct from a successfully-read feed with zero rows, which is `{ articles: [] }`.
 */
async function loadNewsFeed(): Promise<{ articles: NewsArticle[]; refTime: string | null } | null> {
  if (feedCache) return feedCache
  try {
    const res = await fetch(NEWS_FEED_URL)
    if (!res.ok) {
      logger.warn('news feed unavailable:', res.status)
      return null
    }
    const payload = (await res.json()) as unknown
    const rows: unknown[] = Array.isArray(payload)
      ? payload
      : isRecord(payload) && Array.isArray(payload.articles)
        ? (payload.articles as unknown[])
        : []
    const articles = rows
      .filter((r): r is RawNewsRow => isRecord(r))
      .map(mapRow)
      .filter((a): a is NewsArticle => a !== null)
      .sort(byPublishedDesc)
    const refTime = isRecord(payload) && typeof payload.refTime === 'string' ? payload.refTime : null
    feedCache = { articles, refTime }
    return feedCache
  } catch (err) {
    logger.error('news feed fetch threw:', err)
    return null
  }
}

/** Distinct category values actually present in the feed — never a fixed catalogue the feed may not fill. */
function deriveCategories(articles: NewsArticle[]): string[] {
  const seen = new Set<string>()
  for (const a of articles) if (a.category) seen.add(a.category)
  return [...seen].sort()
}

export async function fetchDispatchFeed(): Promise<DispatchFeedResult> {
  const feed = await loadNewsFeed()
  if (!feed) return { status: 'unavailable' }
  if (feed.articles.length === 0) return { status: 'empty' }
  return { status: 'ready', articles: feed.articles, categories: deriveCategories(feed.articles), refTime: feed.refTime }
}

/**
 * Single article by slug, for `/news/:slug`.
 *
 * `not-found` (slug absent from a feed that DID load) and `unavailable`
 * (the feed itself could not be read) render different UI — see
 * `dispatch-article-signal-desk.md` §5 — so they stay distinct results
 * rather than collapsing to one `null`.
 */
export async function fetchArticleBySlug(slug: string): Promise<ArticleLookupResult> {
  if (!slug) return { status: 'not-found' }
  const feed = await loadNewsFeed()
  if (!feed) return { status: 'unavailable' }
  const article = feed.articles.find((a) => a.slug === slug)
  return article ? { status: 'found', article } : { status: 'not-found' }
}
