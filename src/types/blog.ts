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

export interface BlogPostSummary {
  slug: string
  title: string
  dek: string | null
  topic: BlogTopic
  publishedAt: string | null
  readingMin: number | null
  sourceRefsCount: number
}

export interface BlogPost extends BlogPostSummary {
  bodyKo: string | null
  bodyEn: string | null
  writtenBy: string | null
  sourceRefs: BlogSourceRef[]
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
