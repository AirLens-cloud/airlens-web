/**
 * Blog / Field Notes feed reader — `blog-data/posts.json` on the HF live
 * dataset (`Robeedau/airlens-live`, producer: the grace-server Hermes
 * `airlens-writer` profile). Single tier, same reasoning as `api/news.ts`:
 * no bundled static fallback exists to fall back to.
 *
 * Real shape (verified against the live feed 2026-09-01, count=1):
 * `{ posts: [{ slug, title, body_ko, topic, source_refs: string[], published_at, written_by }], count }`.
 * `body_en` is documented in the pipeline but absent from every row seen so
 * far — treated as optional, never backfilled from `body_ko`.
 */
import { HF_LIVE_BASE } from '../lib/config/dataSources'
import { FEED_CACHE_TTL_MS } from '../lib/config/feeds'
import { logger } from '../lib/logger'
import {
  BLOG_TOPICS,
  type BlogFeedResult,
  type BlogHeroImage,
  type BlogPost,
  type BlogPostLookupResult,
  type BlogSourceRef,
  type BlogTopic,
  type BlogVideo,
} from '../types/blog'

const BLOG_FEED_URL = `${HF_LIVE_BASE}/blog-data/posts.json`

interface RawBlogRow {
  slug?: unknown
  title?: unknown
  body_ko?: unknown
  body_en?: unknown
  topic?: unknown
  source_refs?: unknown
  published_at?: unknown
  written_by?: unknown
  hero_image?: unknown
  video?: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

const CHARS_PER_MINUTE = 500
const EXCERPT_MAX_CHARS = 180

function isHeadingParagraph(p: string): boolean {
  return /^#{1,6}\s/.test(p) || /^\*\*[^*]+\*\*$/.test(p)
}

function stripInlineMarkdown(s: string): string {
  return s.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()
}

/** Card dek, derived from the post's own opening paragraph — never generated prose. */
function deriveExcerpt(body: string | null, maxChars = EXCERPT_MAX_CHARS): string | null {
  if (!body) return null
  const paragraph = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== '' && !isHeadingParagraph(p))
    .map(stripInlineMarkdown)
    .find((p) => p !== '')
  if (!paragraph) return null
  if (paragraph.length <= maxChars) return paragraph
  return `${paragraph.slice(0, maxChars).trimEnd()}…`
}

function deriveReadingMinutes(body: string | null): number | null {
  if (!body || !body.trim()) return null
  return Math.max(1, Math.round(body.trim().length / CHARS_PER_MINUTE))
}

function hostLabel(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * `source_refs` is either the writer's array of bare URLs or the
 * `{type,ref,label}` object form. Anything else is dropped rather than
 * rendered as a broken link (`blog-field-notes.md` §3.2).
 */
function mapSourceRefs(raw: unknown): BlogSourceRef[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): BlogSourceRef[] => {
    if (typeof item === 'string') {
      const url = item.trim()
      if (!/^https?:\/\//i.test(url)) return []
      return [{ type: 'data', ref: url, label: hostLabel(url) ?? url }]
    }
    if (!isRecord(item)) return []
    const type = item.type === 'news' || item.type === 'data' ? item.type : null
    if (!type || typeof item.ref !== 'string' || typeof item.label !== 'string') return []
    // `type: 'data'` renders `ref` directly as an external `<a href>`
    // (`SourceRefsBlock`) — same scheme requirement as the bare-URL string
    // branch above, so a `javascript:` (or any other non-http(s)) URI can't
    // reach a real anchor href. `type: 'news'` builds an internal
    // `/news/${ref}` path instead (never an href scheme), so it isn't
    // subject to this check.
    if (type === 'data' && !/^https?:\/\//i.test(item.ref)) return []
    return [{ type, ref: item.ref, label: item.label }]
  })
}

/** Unknown topic values must not silently land in one of the known buckets. */
function coerceTopic(raw: unknown): BlogTopic {
  const t = typeof raw === 'string' ? raw : ''
  return (BLOG_TOPICS as readonly string[]).includes(t) ? (t as BlogTopic) : 'news-review'
}

const HTTPS_URL = /^https:\/\//i

/**
 * `hero_image` (Wave 4) — attribution (`source_name`/`source_url`) is
 * mandatory, not cosmetic: a re-published image with no credit back to the
 * originating source is the one shape this field must never take. Any
 * partial break (missing field, non-https URL) drops the *whole* object
 * rather than rendering an uncredited or mixed-content image.
 */
function mapHeroImage(raw: unknown): BlogHeroImage | null {
  if (!isRecord(raw)) return null
  const url = str(raw.url)
  const sourceName = str(raw.source_name)
  const sourceUrl = str(raw.source_url)
  if (!url || !sourceName || !sourceUrl) return null
  if (!HTTPS_URL.test(url) || !HTTPS_URL.test(sourceUrl)) return null
  return { url, sourceName, sourceUrl, alt: str(raw.alt) }
}

/**
 * `video` (Wave 4) — stores the writer's original watch URL only. Provider
 * detection and embed-src construction happen downstream, in
 * `lib/content/videoEmbed.ts`, never here — this mapper's only job is
 * "is this a well-formed https URL at all".
 */
function mapVideo(raw: unknown): BlogVideo | null {
  if (!isRecord(raw)) return null
  const sourceUrl = str(raw.source_url)
  if (!sourceUrl || !HTTPS_URL.test(sourceUrl)) return null
  return { sourceUrl }
}

function mapPost(row: RawBlogRow): BlogPost | null {
  const slug = str(row.slug)
  const title = str(row.title)
  if (!slug || !title) return null
  const bodyKo = str(row.body_ko)
  const bodyEn = str(row.body_en)
  const dekSource = bodyKo ?? bodyEn
  const sourceRefs = mapSourceRefs(row.source_refs)
  return {
    slug,
    title,
    dek: deriveExcerpt(dekSource),
    topic: coerceTopic(row.topic),
    publishedAt: str(row.published_at),
    readingMin: deriveReadingMinutes(dekSource),
    sourceRefsCount: sourceRefs.length,
    heroImage: mapHeroImage(row.hero_image),
    bodyKo,
    bodyEn,
    writtenBy: str(row.written_by),
    sourceRefs,
    video: mapVideo(row.video),
  }
}

function byPublishedDesc(a: BlogPost, b: BlogPost): number {
  const ta = a.publishedAt ? Date.parse(a.publishedAt) : NaN
  const tb = b.publishedAt ? Date.parse(b.publishedAt) : NaN
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
  if (Number.isNaN(ta)) return 1
  if (Number.isNaN(tb)) return -1
  return tb - ta
}

let feedCache: { posts: BlogPost[]; cachedAt: number } | null = null

/** Test seam — drops the in-memory feed cache. */
export function __resetBlogFeedCache(): void {
  feedCache = null
}

/** Reuses the parsed feed for `FEED_CACHE_TTL_MS` — see that constant's comment for why a TTL matters here. */
async function loadBlogFeed(): Promise<BlogPost[] | null> {
  if (feedCache && Date.now() - feedCache.cachedAt < FEED_CACHE_TTL_MS) return feedCache.posts
  try {
    const res = await fetch(BLOG_FEED_URL)
    if (!res.ok) {
      logger.warn('blog feed unavailable:', res.status)
      return null
    }
    const payload = (await res.json()) as unknown
    const rows: unknown[] = Array.isArray(payload)
      ? payload
      : isRecord(payload) && Array.isArray(payload.posts)
        ? (payload.posts as unknown[])
        : []
    const posts = rows
      .filter((r): r is RawBlogRow => isRecord(r))
      .map(mapPost)
      .filter((p): p is BlogPost => p !== null)
      .sort(byPublishedDesc)
    feedCache = { posts, cachedAt: Date.now() }
    return posts
  } catch (err) {
    logger.error('blog feed fetch threw:', err)
    return null
  }
}

export async function fetchBlogFeed(): Promise<BlogFeedResult> {
  const posts = await loadBlogFeed()
  if (!posts) return { status: 'unavailable' }
  if (posts.length === 0) return { status: 'empty' }
  return { status: 'ready', posts }
}

export async function fetchBlogPostBySlug(slug: string): Promise<BlogPostLookupResult> {
  if (!slug) return { status: 'not-found' }
  const posts = await loadBlogFeed()
  if (!posts) return { status: 'unavailable' }
  const post = posts.find((p) => p.slug === slug)
  return post ? { status: 'found', post } : { status: 'not-found' }
}

/** Test-only handles — keep mappers private to runtime callers. */
export const __test = { mapPost, deriveExcerpt, deriveReadingMinutes, mapSourceRefs, coerceTopic, mapHeroImage, mapVideo }
