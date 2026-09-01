/**
 * News / Dispatch domain types — Signal Desk (Wave D-1).
 *
 * `EditorialTrust` judges the PUBLISHER (how much to trust this source), never
 * a data value. It is a completely different ontology from `DqssGrade`
 * (`components/wireframe/DqssBadge.tsx`), which judges a MEASUREMENT's
 * quality. The two must never share a component, a color scale, or a label
 * format — see `dispatch-article-signal-desk.md` §1/§6-1. Concretely: no
 * letter grades here (A/B/C reads as DQSS at a glance), text tiers only.
 */

export type EditorialTrust = 'verified' | 'external' | 'community'

export const EDITORIAL_TRUST_LABEL: Record<EditorialTrust, string> = {
  verified: 'AirLens verified',
  external: 'External source',
  community: 'Community submitted',
}

/** Client-facing article shape, mapped from the `news-data/articles.json` feed. */
export interface NewsArticle {
  slug: string
  title: string
  summary: string | null
  summaryEn: string | null
  summaryKo: string | null
  sourceName: string | null
  sourceUrl: string | null
  articleUrl: string | null
  publishedAt: string | null
  region: string | null
  countryCode: string | null
  /** Free-text feed tag (e.g. 'community') — distinct from `category`, which drives Dispatch's filter chips. */
  topic: string | null
  imageUrl: string | null
  /** Feed-published bucket (e.g. 'policy' | 'research' | 'environment') — chips are built from whatever values are actually present, never a fixed catalogue the feed may not fill. */
  category: string | null
  isTopStory: boolean
  editorialTrust: EditorialTrust
}

export type ArticleLookupResult =
  | { status: 'found'; article: NewsArticle }
  | { status: 'not-found' }
  | { status: 'unavailable' }

export interface DispatchFeedReady {
  status: 'ready'
  articles: NewsArticle[]
  categories: string[]
  refTime: string | null
}
export type DispatchFeedResult = DispatchFeedReady | { status: 'empty' } | { status: 'unavailable' }
