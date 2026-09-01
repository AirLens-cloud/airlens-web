/**
 * Blog / Field Notes domain types (Wave D-2).
 *
 * Deliberately narrower than the monorepo's `apps/web/src/types/blog.ts`: no
 * `status` (draft/rejected are never published to this static feed — see
 * `blog-field-notes.md` §3.1 D6), no `FieldNoteSourceRef.captured` (the
 * `EvidenceEnvelope`/`DatasetSnapshot` infra it points at does not exist in
 * this repo yet — B1-gated, §3.2). `type='evidence'|'snapshot'` stay out of
 * the union below until that infra lands, so this type can't silently accept
 * a source ref this UI has no way to render honestly.
 */

export type BlogTopic = 'pm25' | 'policy' | 'news-review' | 'health' | 'community' | 'technology'

export const BLOG_TOPICS: readonly BlogTopic[] = [
  'pm25',
  'policy',
  'news-review',
  'health',
  'community',
  'technology',
]

/** `type='news'` refs a `/news/:slug` article, `type='data'` an external URL. */
export interface BlogSourceRef {
  type: 'news' | 'data'
  ref: string
  label: string
}

/**
 * Original-image attribution (Wave 4) — never a re-hosted or re-crawled
 * image, always the source article's own og:image. `sourceName`/`sourceUrl`
 * are non-optional here by construction: `api/blog.ts` `mapHeroImage` drops
 * the whole field rather than produce a `BlogHeroImage` missing either one
 * (`today-starry-quasar.md` §Wave 4 — "귀속 필드 없으면 필드째 드롭").
 */
export interface BlogHeroImage {
  url: string
  sourceName: string
  sourceUrl: string
  alt: string | null
}

/**
 * Original watch URL only — never an embed src. The provider/video-id
 * parse (and the trust boundary of turning that into an iframe src) lives
 * entirely in `lib/content/videoEmbed.ts`, downstream of this type.
 */
export interface BlogVideo {
  sourceUrl: string
}

export interface BlogPostSummary {
  slug: string
  title: string
  dek: string | null
  topic: BlogTopic
  publishedAt: string | null
  readingMin: number | null
  sourceRefsCount: number
  /**
   * Optional (not `heroImage: BlogHeroImage | null`) so pre-Wave-4 call
   * sites that build a `BlogPostSummary` fixture without knowing about
   * media still type-check — every reader must already treat a missing
   * value the same as an explicit `null` (`post.heroImage?.url ?? null`).
   */
  heroImage?: BlogHeroImage | null
}

export interface BlogPost extends BlogPostSummary {
  bodyKo: string | null
  bodyEn: string | null
  writtenBy: string | null
  sourceRefs: BlogSourceRef[]
  /** See `heroImage` doc above — same optional-field reasoning. */
  video?: BlogVideo | null
}

export type BlogPostLookupResult =
  | { status: 'found'; post: BlogPost }
  | { status: 'not-found' }
  | { status: 'unavailable' }

export interface BlogFeedReady {
  status: 'ready'
  posts: BlogPostSummary[]
}
export type BlogFeedResult = BlogFeedReady | { status: 'empty' } | { status: 'unavailable' }
