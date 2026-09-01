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
import { logger } from '../lib/logger'
import { BLOG_TOPICS, type BlogFeedResult, type BlogPost, type BlogPostLookupResult, type BlogSourceRef, type BlogTopic } from '../types/blog'

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
    return [{ type, ref: item.ref, label: item.label }]
  })
}

/** Unknown topic values must not silently land in one of the known buckets. */
function coerceTopic(raw: unknown): BlogTopic {
  const t = typeof raw === 'string' ? raw : ''
  return (BLOG_TOPICS as readonly string[]).includes(t) ? (t as BlogTopic) : 'news-review'
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
    bodyKo,
    bodyEn,
    writtenBy: str(row.written_by),
    sourceRefs,
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

let feedCache: BlogPost[] | null = null

/** Test seam — drops the in-memory feed cache. */
export function __resetBlogFeedCache(): void {
  feedCache = null
}

async function loadBlogFeed(): Promise<BlogPost[] | null> {
  if (feedCache) return feedCache
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
    feedCache = rows
      .filter((r): r is RawBlogRow => isRecord(r))
      .map(mapPost)
      .filter((p): p is BlogPost => p !== null)
      .sort(byPublishedDesc)
    return feedCache
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
export const __test = { mapPost, deriveExcerpt, deriveReadingMinutes, mapSourceRefs, coerceTopic }
