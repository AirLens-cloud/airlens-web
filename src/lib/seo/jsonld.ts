// Pure SEO / JSON-LD string builders. No DOM, no browser or vite deps — safe to
// import from BOTH the SPA and the Cloudflare Pages Functions (SSR).
//
// Ported verbatim from AirLens-platform apps/web `src/lib/seo/jsonld.ts` (the
// retired monorepo web) for the SSR SEO shell port (Wave 1, plan
// airlens-airlens-web-2-curious-chipmunk). This module has no locale
// dependency in the source either — no changes beyond the header comment.

export const CANONICAL_ORIGIN = 'https://airlens.cloud'

const ORG = {
  '@type': 'Organization',
  name: 'AirLens',
  url: CANONICAL_ORIGIN,
  logo: `${CANONICAL_ORIGIN}/icon-512.png`,
} as const

// Single source for the dataset license URL — used by both the country-hub
// Dataset and the news-page nested `about` Dataset.
const DATASET_LICENSE = `${CANONICAL_ORIGIN}/legal/terms`

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape text for safe interpolation into HTML element content or attributes. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c)
}

/**
 * Whitelist http(s) URLs for href/src/JSON-LD use. `escapeHtml` does NOT block
 * `javascript:` / `data:` schemes, so a defense-in-depth scheme check is applied
 * at the SSR layer (not only in the ingest pipeline) before any URL is emitted.
 * Returns null for non-http(s) or malformed input.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/**
 * Serialize an object for embedding in `<script type="application/ld+json">`.
 * Escaping `<` prevents a stray `</script>` inside a string from breaking out
 * of the tag (the only injection vector for ld+json blocks).
 */
export function ldScriptJson(obj: Record<string, unknown>): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}

export interface ArticleSeoInput {
  slug: string | null
  title: string
  summary?: string | null
  summary_en?: string | null
  summary_ko?: string | null
  source_name?: string | null
  source_url?: string | null
  article_url?: string | null
  image_url?: string | null
  published_at?: string | null
  created_at?: string | null
  country_code?: string | null
  related_policy_id?: string | null
}

/**
 * schema.org NewsArticle. Honesty: AirLens summarizes third-party reporting, it
 * does not author it — the original is credited via `isBasedOn` +
 * `sourceOrganization` rather than claimed as our own work.
 */
export function newsArticleJsonLd(a: ArticleSeoInput, pageUrl: string, description: string): string {
  const obj: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title,
    description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
    publisher: ORG,
    isAccessibleForFree: true,
  }
  const safeImage = safeHttpUrl(a.image_url)
  if (safeImage) obj.image = [safeImage]
  const published = a.published_at ?? a.created_at
  if (published) {
    obj.datePublished = published
    obj.dateModified = published
  }
  const original = safeHttpUrl(a.article_url ?? a.source_url)
  if (original) obj.isBasedOn = original
  if (a.source_name) obj.sourceOrganization = { '@type': 'Organization', name: a.source_name }
  // Link the story to AirLens's own country air-quality + policy dataset so search
  // / AI systems connect the entity (differentiation, not bare restatement). The
  // nested Dataset is self-described (name + description + creator + license) so it
  // is a valid Dataset entity on its own — Google flags name+url-only stubs.
  const cc = (a.country_code ?? '').toUpperCase()
  if (/^[A-Z]{2,3}$/.test(cc)) {
    obj.about = {
      '@type': 'Dataset',
      name: `${cc} clean-air policy impact`,
      description: `AirLens clean-air policy impact dataset for ${cc}: PM2.5 annual-mean trends and SDID causal analysis, shown with Glass-box uncertainty.`,
      creator: ORG,
      license: DATASET_LICENSE,
      url: `${CANONICAL_ORIGIN}/country/${cc}`,
    }
  }
  return ldScriptJson(obj)
}

/** Optional richer Dataset metadata (E-E-A-T + Google Dataset Search). */
export interface CountryDatasetMeta {
  countryCode?: string | null
  dateModified?: string | null
  treatmentYear?: number | null
  /**
   * The actual URL a crawler can fetch for this country's raw data — this
   * module has no data-source knowledge of its own (see file header: no DOM
   * or browser deps, safe for both SPA and SSR), so the caller must supply
   * a real, live URL rather than this module inventing one. A prior version
   * emitted `${CANONICAL_ORIGIN}/data/policy-impact/{cc}.json`, a path this
   * repo never published — Google Dataset Search would have flagged the
   * `distribution` as a dead link (code review finding, Wave 1 SSR port).
   * Omitted (not set) when the caller has no such URL — `distribution` is
   * then left off entirely rather than emitting a guessed one.
   */
  distributionContentUrl?: string | null
}

/** schema.org Dataset for a country air-quality + policy hub page. */
export function countryDatasetJsonLd(
  countryName: string,
  pageUrl: string,
  description: string,
  meta?: CountryDatasetMeta,
): string {
  const obj: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${countryName} air quality & clean-air policy impact`,
    description,
    creator: ORG,
    publisher: ORG,
    url: pageUrl,
    isAccessibleForFree: true,
    license: DATASET_LICENSE,
    // First-party provenance — what makes this a citable dataset, not a restatement.
    variableMeasured: 'PM2.5 annual mean (µg/m³)',
    measurementTechnique: 'Synthetic Difference-in-Differences (SDID)',
    citation: `${CANONICAL_ORIGIN}/methodology`,
  }
  if (meta?.dateModified) obj.dateModified = meta.dateModified
  if (meta?.treatmentYear != null) obj.temporalCoverage = String(meta.treatmentYear)
  // Both checks stay required, not just the URL one: `cc` is the same
  // plausible-ISO-code sanity gate this function has always applied before
  // describing a country dataset at all, independent of where the URL comes
  // from.
  const cc = (meta?.countryCode ?? '').toUpperCase()
  const contentUrl = safeHttpUrl(meta?.distributionContentUrl)
  if (/^[A-Z]{2,3}$/.test(cc) && contentUrl) {
    obj.distribution = {
      '@type': 'DataDownload',
      encodingFormat: 'application/json',
      contentUrl,
    }
  }
  return ldScriptJson(obj)
}

/** Input shape for a blog post JSON-LD (locale-resolved by the caller). */
export interface BlogPostSeoInput {
  slug: string
  title: string
  dek?: string | null
  hero_image?: string | null
  author?: string | null
  published_at?: string | null
}

/**
 * schema.org BlogPosting for an original AirLens editorial post. Unlike the
 * aggregated NewsArticle (which credits a third-party source via isBasedOn),
 * this is AirLens's OWN work — author + publisher = AirLens, no isBasedOn.
 */
export function blogPostingJsonLd(a: BlogPostSeoInput, pageUrl: string, description: string): string {
  const obj: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: a.title,
    description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
    author: a.author ? { '@type': 'Organization', name: a.author } : ORG,
    publisher: ORG,
    isAccessibleForFree: true,
  }
  const safeImage = safeHttpUrl(a.hero_image)
  if (safeImage) obj.image = [safeImage]
  if (a.published_at) {
    obj.datePublished = a.published_at
    obj.dateModified = a.published_at
  }
  return ldScriptJson(obj)
}

/** schema.org BreadcrumbList — Home › section › current. */
export function breadcrumbJsonLd(trail: Array<{ name: string; url: string }>): string {
  return ldScriptJson({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  })
}

/** schema.org FAQPage — deterministic Q&A copy (today / insights SSR). */
export function faqPageJsonLd(faqs: Array<{ q: string; a: string }>): string {
  return ldScriptJson({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  })
}

/** One term of a DefinedTermSet — see `definedTermSetJsonLd`. */
export interface DefinedTermInput {
  termId: string
  term: string
  definition: string
  url: string
}

/**
 * schema.org DefinedTermSet — the site glossary as one machine-readable term
 * collection (O2, aq-ontology-feasibility-2026-09-02.md §3). `/glossary` has
 * no SSR handler in this repo (`functions/_lib/pageHandlers.ts`), so this is
 * consumed client-side by `Glossary.tsx` rather than through `pageSeo.ts`.
 */
export function definedTermSetJsonLd(
  name: string,
  description: string,
  pageUrl: string,
  terms: DefinedTermInput[],
): string {
  return ldScriptJson({
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name,
    description,
    url: pageUrl,
    publisher: ORG,
    hasDefinedTerm: terms.map((t) => ({
      '@type': 'DefinedTerm',
      '@id': `${pageUrl}#${t.termId}`,
      name: t.term,
      description: t.definition,
      url: t.url,
      inDefinedTermSet: pageUrl,
    })),
  })
}

/** schema.org CollectionPage with a mainEntity ItemList — blog / dispatch list SSR. */
export function collectionPageJsonLd(
  name: string,
  description: string,
  pageUrl: string,
  items: Array<{ name: string; url: string }>,
): string {
  return ldScriptJson({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: pageUrl,
    publisher: ORG,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        url: item.url,
      })),
    },
  })
}
