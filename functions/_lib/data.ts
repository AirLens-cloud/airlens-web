// Data access for the SSR Pages Functions.
//
// Ported from AirLens-platform apps/web `functions/_lib/data.ts` (Wave 1,
// plan airlens-airlens-web-2-curious-chipmunk), rewired for this repo's data
// plane. The source read same-origin static JSON via `env.ASSETS.fetch`
// (`/data/news/articles.json`, `/data/policy-registry/{CC}.json`, ...) — this
// repo has no such mirror; news/blog/policy data lives on the public HF live
// dataset (`Robeedau/airlens-live`, `HF_LIVE_BASE` — `src/lib/config/dataSources.ts`)
// and is fetched directly with the Workers-global `fetch`, exactly like
// `src/api/*.ts` do client-side.
//
// News and blog reads REUSE the real app fetchers (`src/api/news.ts`,
// `src/api/blog.ts`) rather than re-implementing the parse — one parser, so
// the crawler and the SPA can never render two different things from the same
// row. This was only possible for news after fixing
// `src/components/content/htmlToText.ts`'s `DOMParser` dependency (browser-only;
// absent from the Cloudflare Workers `workerd` runtime this Function executes
// in) to fall back to a regex strip — see that file's comment.
//
// Country data has no equivalent app-layer module to reuse: `src/api/policy.ts`
// maps the raw `policy-impact/{CC}.json` into a camelCase `PolicyImpact` that
// drops the dated `synthetic_control` shape `pageSeo.ts`'s trend-line/
// methodology text needs — so country reads fetch the same URLs directly and
// pass the raw JSON through typed as `pageSeo.ts`'s (ported, source-shaped)
// `CountryImpact`, rather than through that mapper.

import { HF_LIVE_BASE } from '../../src/lib/config/dataSources'
import type { ArticleSeoInput } from '../../src/lib/seo/jsonld'
import type {
  CountryRegistry,
  CountryImpact,
  BlogPostSeoRow,
  BlogListRow,
  NewsListRow,
} from '../../src/lib/seo/pageSeo'
import { fetchDispatchFeed, fetchArticleBySlug as fetchArticleBySlugFromFeed } from '../../src/api/news'
import { fetchBlogFeed as fetchBlogFeedResult, fetchBlogPostBySlug } from '../../src/api/blog'
import type { NewsArticle } from '../../src/types/news'
import type { BlogPost } from '../../src/types/blog'
import type { PolicyIndexEntry } from '../../src/types/policy'

export interface Env {
  ASSETS: { fetch: (input: Request | string) => Promise<Response> }
}

// src/api/policy.ts's mapper is lossy (see module header) — these are defined
// locally for the raw shape pageSeo.ts needs. If the source path ever moves,
// update both this pair and src/api/policy.ts's URL construction.
const POLICY_IMPACT_BASE = `${HF_LIVE_BASE}/insights-data/policy-impact`
const POLICY_INDEX_URL = `${POLICY_IMPACT_BASE}/index.json`

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// ── News (reuses src/api/news.ts's real fetch + parse) ──────────────────────

function newsArticleToSeoInput(a: NewsArticle): ArticleSeoInput {
  return {
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    summary_en: a.summaryEn,
    summary_ko: a.summaryKo,
    source_name: a.sourceName,
    source_url: a.sourceUrl,
    article_url: a.articleUrl,
    image_url: a.imageUrl,
    published_at: a.publishedAt,
    country_code: a.countryCode,
  }
}

export async function fetchArticleBySlug(slug: string): Promise<ArticleSeoInput | null> {
  const result = await fetchArticleBySlugFromFeed(slug)
  return result.status === 'found' ? newsArticleToSeoInput(result.article) : null
}

export async function fetchNewsListForSeo(limit = 40): Promise<NewsListRow[] | null> {
  const feed = await fetchDispatchFeed()
  if (feed.status === 'unavailable') return null
  if (feed.status === 'empty') return []
  return feed.articles.slice(0, limit).map((a) => ({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    summary_en: a.summaryEn,
    summary_ko: a.summaryKo,
    source_name: a.sourceName,
    published_at: a.publishedAt,
  }))
}

/** All feed articles as `ArticleSeoInput`, for the sitemap's indexability gate. Empty (never null) when the feed can't be read — a sitemap with fewer URLs than a hard failure. */
export async function fetchAllArticlesForSitemap(): Promise<ArticleSeoInput[]> {
  const feed = await fetchDispatchFeed()
  return feed.status === 'ready' ? feed.articles.map(newsArticleToSeoInput) : []
}

// ── Blog (reuses src/api/blog.ts's real fetch + parse) ───────────────────────

/**
 * The feed carries ONE `title` (and, for the list summary, one `dek`) — which
 * language it's in is decided by which body is present, same rule
 * `src/api/blog.ts`'s (private) `isKoreanOriginalPost` uses: a Korean body, or
 * no English body at all, makes it Korean. Re-derived here rather than
 * imported because the source doesn't export it.
 */
function isKoreanOriginal(post: Pick<BlogPost, 'bodyKo' | 'bodyEn'>): boolean {
  const hasKo = Boolean(post.bodyKo?.trim())
  const hasEn = Boolean(post.bodyEn?.trim())
  return hasKo || !hasEn
}

function blogPostToSeoRow(post: BlogPost): BlogPostSeoRow {
  const ko = isKoreanOriginal(post)
  return {
    slug: post.slug,
    topic: post.topic,
    title_en: ko ? null : post.title,
    title_ko: ko ? post.title : null,
    dek_en: ko ? null : post.dek,
    dek_ko: ko ? post.dek : null,
    body_md_en: post.bodyEn,
    body_md_ko: post.bodyKo,
    hero_image: post.heroImage?.url ?? null,
    author: post.writtenBy,
    published_at: post.publishedAt,
    source_refs: post.sourceRefs,
  }
}

export async function fetchBlogPostForSeo(slug: string): Promise<BlogPostSeoRow | null> {
  const result = await fetchBlogPostBySlug(slug)
  return result.status === 'found' ? blogPostToSeoRow(result.post) : null
}

/**
 * The list page reads the feed through `fetchBlogFeed()`'s public
 * `BlogFeedResult`, whose declared `posts: BlogPostSummary[]` type has no
 * `writtenBy`/`bodyKo`/`bodyEn` — narrower than the full `BlogPost` the same
 * runtime objects actually are (`BlogPost extends BlogPostSummary`). Without a
 * body to test, this can't re-derive `isKoreanOriginal` — so it assumes ko
 * (per the module header: every row seen so far is Korean-original; an
 * English-only post would still resolve to the right displayed title via
 * `blogText()`'s ko-then-en fallback, just mislabeled as `title_ko` rather
 * than `title_en`). `author` (no `writtenBy` at this type) is honestly
 * dropped rather than guessed — an optional field on `BlogListRow`.
 */
export async function fetchBlogListForSeo(limit = 50): Promise<BlogListRow[] | null> {
  const feed = await fetchBlogFeedResult()
  if (feed.status === 'unavailable') return null
  if (feed.status === 'empty') return []
  return feed.posts.slice(0, limit).map((p) => ({
    slug: p.slug,
    title_en: null,
    title_ko: p.title,
    dek_en: null,
    dek_ko: p.dek,
    published_at: p.publishedAt,
  }))
}

/**
 * All published posts as `BlogPostSeoRow`, for the sitemap's indexability
 * gate. Same `BlogPostSummary` boundary as `fetchBlogListForSeo` — no body at
 * this type, so `shouldIndexBlogPost` (which requires one) can only pass a
 * row through `dek_ko` as a body-shaped stand-in. This undercounts (a real
 * post could be excluded if `dek` derivation failed) but never overcounts a
 * body-less row into the sitemap.
 */
export async function fetchAllBlogPostsForSitemap(): Promise<BlogPostSeoRow[]> {
  const feed = await fetchBlogFeedResult()
  if (feed.status !== 'ready') return []
  return feed.posts.map((p) => ({
    slug: p.slug,
    title_en: null,
    title_ko: p.title,
    dek_en: null,
    dek_ko: p.dek,
    body_md_en: null,
    body_md_ko: p.dek,
    published_at: p.publishedAt,
  }))
}

// ── Country (raw fetch — see module header for why this bypasses src/api/policy.ts) ──

export interface CountryData {
  registry: CountryRegistry
  impact: CountryImpact | null
}

async function fetchPolicyIndexRaw(): Promise<PolicyIndexEntry[] | null> {
  const rows = await fetchJson<PolicyIndexEntry[]>(POLICY_INDEX_URL)
  return Array.isArray(rows) ? rows : null
}

/**
 * Single-country SDID impact. `code` may come from an article's feed-stored
 * `country_code` (untrusted) — the uppercase + ISO regex guard runs before it
 * touches the network (path-traversal / bad-input guard, same as the source).
 */
export async function fetchCountryImpact(code: string): Promise<CountryImpact | null> {
  const cc = (code ?? '').toUpperCase()
  if (!/^[A-Z]{2,3}$/.test(cc)) return null
  return fetchJson<CountryImpact>(`${POLICY_IMPACT_BASE}/${cc}.json`)
}

/**
 * `null` means "not a tracked country" (absent from the index) — the caller
 * falls back to the plain SPA shell, same as the source's
 * policy-registry-file-missing case. This repo's feed has no per-policy list
 * (`policy-registry/{CC}.json` `policies[]`) — `registry.policies` is always
 * `[]`, which `countryBodyHtml` already renders as "no tracked policies
 * section" rather than fabricating rows.
 */
export async function fetchCountryData(code: string): Promise<CountryData | null> {
  const cc = (code ?? '').toUpperCase()
  if (!/^[A-Z]{2,3}$/.test(cc)) return null
  const index = await fetchPolicyIndexRaw()
  const entry = index?.find((e) => (e.countryCode ?? '').toUpperCase() === cc) ?? null
  if (!entry) return null
  const registry: CountryRegistry = {
    countryCode: cc,
    countryName: entry.country ?? null,
    flag: entry.flag ?? null,
    totalPolicies: entry.policyCount ?? null,
    policies: [],
  }
  const impact = await fetchCountryImpact(cc)
  return { registry, impact }
}

/** Country codes + last-updated, for the dynamic sitemap. */
export async function fetchCountryCodesForSitemap(): Promise<Array<{ countryCode: string; lastUpdated: string | null }>> {
  const index = await fetchPolicyIndexRaw()
  if (!index) return []
  return index
    .filter((e) => e.countryCode)
    .map((e) => ({ countryCode: e.countryCode.toUpperCase(), lastUpdated: e.lastUpdated ?? null }))
}
