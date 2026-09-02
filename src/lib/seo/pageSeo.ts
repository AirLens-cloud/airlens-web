// Pure page-level SEO derivation: title / description / robots / JSON-LD /
// crawler-visible body HTML for the news-article, country-policy, blog and
// list-page SSR pages. No DOM or browser deps — imported by the Cloudflare
// Pages Functions (functions/news, functions/country, functions/blog, ...)
// and tested in pageSeo.test.ts.
//
// Ported from AirLens-platform apps/web `src/lib/seo/pageSeo.ts` (Wave 1, plan
// airlens-airlens-web-2-curious-chipmunk). One structural difference from the
// source: the monorepo served a `/ko` URL-locale tree (`withLocale`,
// `UrlLocale`, hreflang alternates) — this repo has no `/ko` routes (locale
// here, where it exists at all, is client-side only), so all of that plumbing
// is dropped rather than ported dead. Every `lang` parameter the source
// threaded through is gone too; copy is English-only, matching this repo's
// `index.html lang="en"` and its `en`-only content pipeline.

import {
  CANONICAL_ORIGIN,
  escapeHtml,
  safeHttpUrl,
  newsArticleJsonLd,
  blogPostingJsonLd,
  countryDatasetJsonLd,
  breadcrumbJsonLd,
  collectionPageJsonLd,
  faqPageJsonLd,
  type ArticleSeoInput,
} from './jsonld'
import { ATT_PLAUSIBLE_MAX } from '../config/policy'
import { POLICY_IMPACT_BASE } from '../config/dataSources'

export interface PageSeo {
  title: string
  description: string
  canonicalUrl: string
  robots: 'index, follow' | 'noindex, follow'
  ogType: 'article' | 'website'
  ogImage?: string
  jsonLd: string[]
  bodyHtml: string
}

const SITE = 'AirLens'

function clamp(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

/** Finite-number coercion for values that may arrive as strings from JSON. */
function finite(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Glass-box reliability gate for an SDID estimate — a real number is shown ONLY
 * when significant, ATT present, magnitude plausible, and the 95% CI excludes 0.
 * Pure mirror of `attReliability()` (`src/api/policy.ts`) === 'reliable'.
 */
function isReliableEffect(impact: CountryImpact | null): boolean {
  const att = finite(impact?.att)
  if (att === null || !impact?.significant) return false
  if (Math.abs(att) > ATT_PLAUSIBLE_MAX) return false
  const ci = Array.isArray(impact?.ci_95) && impact!.ci_95!.length === 2 ? impact!.ci_95! : null
  if (ci && finite(ci[0]) !== null && finite(ci[1]) !== null && ci[0] <= 0 && ci[1] >= 0) return false
  return true
}

/** SDID effect headline (number only — caller decides whether reliable). */
function policyEffectHeadline(impact: CountryImpact): string {
  const att = finite(impact.att)
  const ci = Array.isArray(impact.ci_95) && impact.ci_95.length === 2 ? impact.ci_95 : null
  const ciText = ci && finite(ci[0]) !== null && finite(ci[1]) !== null
    ? ` (95% CI ${finite(ci[0])} to ${finite(ci[1])} µg/m³)`
    : ''
  return `SDID-estimated annual PM2.5 change after clean-air policy: ${att} µg/m³${ciText}`
}

/** First→last observed PM2.5 from the synthetic-control series (real data, no fabrication). */
function pm25TrendText(impact: CountryImpact | null): string | null {
  const sc = Array.isArray(impact?.synthetic_control) ? impact!.synthetic_control! : []
  const pts = sc.filter((p) => p?.date && finite(p?.pm25) !== null)
  if (pts.length < 2) return null
  const a = pts[0], b = pts[pts.length - 1]
  return `AirLens-tracked PM2.5 ${String(a.date).slice(0, 4)}→${String(b.date).slice(0, 4)}: ${finite(a.pm25)}→${finite(b.pm25)} µg/m³`
}

// ── News article ──────────────────────────────────────────────────────────

/** Best available human summary (en-first — this repo has no ko URL tree). */
export function articleSummaryText(a: ArticleSeoInput): string | null {
  return a.summary_en ?? a.summary_ko ?? a.summary ?? null
}

/**
 * Differentiation anchor: an article links to AirLens's own analysis (country
 * air-quality / SDID policy impact) rather than being a bare restatement of a
 * third-party source. country_code OR related_policy_id is the cheap, per-article
 * proxy the sitemap + robots gate can evaluate without an extra fetch.
 */
export function articleDifferentiation(a: ArticleSeoInput): boolean {
  return Boolean(a.country_code || a.related_policy_id)
}

/**
 * Honesty + differentiation gate (Google scaled-content policy + Glass-box): index
 * an article page only when it carries real value — a summary AND a differentiation
 * anchor to AirLens's own data. A faithful summary alone is still "restatement of
 * other sources" (scaled-content risk), so summary-only / content-pending shells
 * stay noindex. This makes every indexed page genuinely differentiated.
 */
export function shouldIndexArticle(a: ArticleSeoInput): boolean {
  return Boolean(articleSummaryText(a)) && articleDifferentiation(a)
}

/** Optional first-party data attached to an article page (AirLens's own analysis). */
export interface ArticleContext {
  impact?: CountryImpact | null
}

function airlensDataSection(cc: string, impact: CountryImpact | null): string {
  // cc is already uppercased + ISO-shaped by the caller; escape defensively.
  const safeCc = escapeHtml(cc)
  const lines: string[] = []
  // The page's value-add: AirLens's OWN numbers inline, not a bare restatement.
  if (isReliableEffect(impact)) lines.push(`<p>${escapeHtml(policyEffectHeadline(impact!))}</p>`)
  const trend = pm25TrendText(impact)
  if (trend) lines.push(`<p>${escapeHtml(trend)}</p>`)
  const body = lines.length
    ? `<p><strong>AirLens data — ${safeCc}</strong></p>${lines.join('')}` +
      `<p><small>AirLens's own measurements &amp; SDID causal analysis (Glass-box: shown with 95% CI, withheld when controls are insufficient).</small></p>`
    : `<p><strong>AirLens analysis — ${safeCc}</strong></p>`
  return (
    `<section aria-label="AirLens analysis">${body}` +
    `<p><a href="/country/${safeCc}">${safeCc} air quality &amp; clean-air policy →</a></p></section>`
  )
}

function articleBodyHtml(a: ArticleSeoInput, summary: string | null, ctx?: ArticleContext): string {
  const ccRaw = (a.country_code ?? '').toUpperCase()
  const cc = /^[A-Z]{2,3}$/.test(ccRaw) ? ccRaw : ''
  const parts: string[] = [`<h1>${escapeHtml(a.title)}</h1>`]
  if (a.source_name || a.published_at) {
    const meta = [a.source_name, a.published_at?.slice(0, 10)].filter(Boolean).map((x) => escapeHtml(String(x)))
    parts.push(`<p class="ssr-meta">${meta.join(' · ')}</p>`)
  }
  if (summary) {
    parts.push(
      `<section aria-label="AirLens summary"><p><strong>AirLens summary</strong></p>` +
        `<p>${escapeHtml(summary)}</p>` +
        `<p><small>AirLens summary is a faithful digest of third-party reporting, not the source's own assertion — verify with the original.</small></p></section>`,
    )
  }
  // AirLens differentiation: the page carries our OWN data (PM2.5 trend + SDID
  // policy effect) inline, linking to the full country analysis — not a bare
  // restatement of the source (Google scaled-content avoidance).
  if (cc) parts.push(airlensDataSection(cc, ctx?.impact ?? null))
  const original = safeHttpUrl(a.article_url ?? a.source_url)
  if (original) {
    const label = a.source_name ? `Read the original at ${escapeHtml(a.source_name)}` : 'Read the original'
    parts.push(`<p><a href="${escapeHtml(original)}" rel="nofollow noopener" target="_blank">${label} →</a></p>`)
  }
  parts.push(`<p><a href="/dispatch">← Back to Dispatch</a></p>`)
  return `<main class="ssr-seo"><article>${parts.join('')}</article></main>`
}

export function articlePageSeo(a: ArticleSeoInput, slug: string, ctx?: ArticleContext): PageSeo {
  const summary = articleSummaryText(a)
  const canonicalUrl = `${CANONICAL_ORIGIN}/news/${slug}`
  const title = clamp(`${a.title} — ${SITE}`, 70)
  const description = clamp(summary ?? a.title, 200)
  const jsonLd = [
    newsArticleJsonLd(a, canonicalUrl, description),
    breadcrumbJsonLd([
      { name: 'Home', url: `${CANONICAL_ORIGIN}/` },
      { name: 'Dispatch', url: `${CANONICAL_ORIGIN}/dispatch` },
      { name: a.title, url: canonicalUrl },
    ]),
  ]
  return {
    title,
    description,
    canonicalUrl,
    robots: shouldIndexArticle(a) ? 'index, follow' : 'noindex, follow',
    ogType: 'article',
    ogImage: safeHttpUrl(a.image_url) ?? undefined,
    jsonLd,
    bodyHtml: articleBodyHtml(a, summary, ctx),
  }
}

// ── Country policy hub ──────────────────────────────────────────────────────

export interface PolicyEntry {
  name?: string | null
  nameLocal?: string | null
  type?: string | null
  adoptedDate?: string | null
  pollutants?: string[] | null
}

export interface CountryRegistry {
  countryCode: string
  countryName?: string | null
  flag?: string | null
  totalPolicies?: number | null
  /**
   * This repo's HF live dataset publishes a per-country POLICY COUNT
   * (`insights-data/policy-impact/index.json` `policyCount`), not the
   * monorepo's per-policy list (`policy-registry/{CC}.json` `policies[]` —
   * name/type/adoptedDate per row). `policies`/`standards` stay here so
   * `countryBodyHtml` below still renders a "tracked policies" list on the
   * rare page where a caller can supply one; the port's own adapter
   * (`functions/_lib/data.ts`) always passes `[]`, which honestly degrades
   * to no list section rather than fabricating rows.
   */
  policies?: PolicyEntry[] | null
  standards?: PolicyEntry[] | null
}

function countryPolicies(reg: CountryRegistry): PolicyEntry[] {
  return (reg.policies ?? reg.standards ?? []).filter((p): p is PolicyEntry => Boolean(p?.name))
}

/** One year of the SDID synthetic-control series (observed vs counterfactual). */
export interface SyntheticControlPoint {
  date?: string | null
  pm25?: number | null
  synthetic_pm25?: number | null
  event?: string | null
}

/**
 * Country SDID impact — shape of `insights-data/policy-impact/{CC}.json` on the
 * HF live dataset (field-for-field the same shape the monorepo's
 * `policy-impact/{CC}.json` published — see `src/api/policy.ts`
 * `RawPolicyImpactData`). Fields beyond the core estimate (method /
 * treatment_year / se / robustness / generated_at) feed the methodology +
 * citation blocks (E-E-A-T); synthetic_control feeds the PM2.5 trend line.
 * All optional — most countries are honesty-gated.
 */
export interface CountryImpact {
  att?: number | null
  ci_95?: [number, number] | number[] | null
  p_value?: number | null
  significant?: boolean | null
  status?: string | null
  method?: string | null
  treatment_year?: number | null
  se?: number | null
  synthetic_control?: SyntheticControlPoint[] | null
  robustness?: {
    parallel_trend?: { p_value?: number | null; pass?: boolean | null } | null
    placebo?: { mean?: number | null; pass?: boolean | null } | null
  } | null
  generated_at?: string | null
  data_quality?: {
    dqss_score?: number | null
    disclaimer?: string | null
    station_count?: number | null
    coverage_years?: number | null
    data_source?: string | null
  } | null
}

/**
 * Glass-box honest effect line: a real estimate ONLY when significant with a
 * non-null ATT; otherwise the data-quality disclaimer — never a fabricated
 * number. Mirrors the SDID honesty gate (`src/api/policy.ts` `attReliability`).
 */
function policyEffectText(impact: CountryImpact | null): string {
  if (!isReliableEffect(impact)) {
    const why = impact?.data_quality?.disclaimer ?? 'insufficient control countries for a reliable counterfactual'
    return `Policy effect estimate is not yet conclusive (${why}).`
  }
  const p = finite(impact!.p_value) !== null ? `, p=${finite(impact!.p_value)}` : ''
  return `${policyEffectHeadline(impact!)}${p}.`
}

/** Human label for the SDID method id (E-E-A-T: name the technique explicitly). */
function methodLabel(method: string | null | undefined): string {
  return (method ?? '').toLowerCase() === 'sdid'
    ? 'Synthetic Difference-in-Differences (SDID)'
    : method ?? 'Synthetic Difference-in-Differences (SDID)'
}

/**
 * Methodology block — the causal-inference rigor behind the estimate (method,
 * treatment year, robustness tests, data quality). E-E-A-T / expertise signal.
 * Honest: shows the actual pass/fail and disclaimer, never a fabricated result.
 * All values escaped (free-ish text from the static JSON / generation pipeline).
 */
function countryMethodologyHtml(impact: CountryImpact | null): string {
  if (!impact) return ''
  const dq = impact.data_quality ?? {}
  const rb = impact.robustness ?? {}
  const rows: string[] = [`Method: ${methodLabel(impact.method)}`]
  if (finite(impact.treatment_year) !== null) rows.push(`Treatment year: ${finite(impact.treatment_year)}`)
  const pt = rb.parallel_trend
  if (pt && pt.pass != null) {
    const p = finite(pt.p_value) !== null ? ` (p=${finite(pt.p_value)})` : ''
    rows.push(`Parallel-trend test: ${pt.pass ? 'pass' : 'fail'}${p}`)
  }
  const pb = rb.placebo
  if (pb && pb.pass != null) rows.push(`Placebo test: ${pb.pass ? 'pass' : 'fail'}`)
  if (finite(dq.dqss_score) !== null) rows.push(`DQSS: ${finite(dq.dqss_score)}`)
  if (finite(dq.station_count) !== null) rows.push(`Stations: ${finite(dq.station_count)}`)
  if (finite(dq.coverage_years) !== null) rows.push(`Coverage: ${finite(dq.coverage_years)} yr`)
  if (dq.data_source) rows.push(`Data source: ${dq.data_source}`)
  const items = rows.map((r) => `<li>${escapeHtml(r)}</li>`).join('')
  return (
    `<section aria-label="Methodology"><p><strong>Methodology</strong></p><ul>${items}</ul>` +
    `<p><small>Full method: <a href="/methodology">AirLens methodology</a>.</small></p></section>`
  )
}

/** Citable reference line for the country dataset (authoritativeness signal). */
function countryCitationHtml(name: string, canonicalUrl: string, impact: CountryImpact | null): string {
  const gen = impact?.generated_at ?? ''
  const year = gen.slice(0, 4) || ''
  const retrieved = gen.slice(0, 10)
  const cite =
    `AirLens${year ? ` (${year})` : ''}. ${name} clean-air policy impact (SDID).` +
    `${retrieved ? ` Generated ${retrieved}.` : ''} ${canonicalUrl}`
  return `<section aria-label="Citation"><p><strong>Citation</strong></p><p><small>${escapeHtml(cite)}</small></p></section>`
}

function countryBodyHtml(reg: CountryRegistry, impact: CountryImpact | null, name: string, canonicalUrl: string): string {
  const policies = countryPolicies(reg)
  const list = policies
    .map((p) => {
      const year = (p.adoptedDate ?? '').slice(0, 4)
      const bits = [year, p.type].filter(Boolean).map((x) => escapeHtml(String(x)))
      const meta = bits.length ? ` <span class="ssr-meta">(${bits.join(' · ')})</span>` : ''
      return `<li>${escapeHtml(String(p.name))}${meta}</li>`
    })
    .join('')
  return (
    `<main class="ssr-seo"><article>` +
    `<h1>${escapeHtml(name)} — Air Quality &amp; Clean-Air Policy</h1>` +
    `<section aria-label="Policy impact"><p><strong>Policy impact (SDID)</strong></p>` +
    `<p>${escapeHtml(policyEffectText(impact))}</p>` +
    `<p><small>Estimates are Glass-box: shown with uncertainty (95% CI) and withheld when controls are insufficient. p10–p90 / DQSS detail on the page.</small></p></section>` +
    (list ? `<section aria-label="Tracked policies"><p><strong>${policies.length} tracked policies</strong></p><ul>${list}</ul></section>` : '') +
    countryMethodologyHtml(impact) +
    countryCitationHtml(name, canonicalUrl, impact) +
    `<p><a href="/insights?country=${escapeHtml(reg.countryCode)}">Full policy impact analysis →</a></p>` +
    `<p><a href="/dispatch?q=${escapeHtml(name)}">Related news →</a></p>` +
    `</article></main>`
  )
}

export function countryPageSeo(reg: CountryRegistry, impact: CountryImpact | null): PageSeo {
  const code = reg.countryCode.toUpperCase()
  const name = reg.countryName ?? code
  const canonicalUrl = `${CANONICAL_ORIGIN}/country/${code}`
  const count = reg.totalPolicies ?? countryPolicies(reg).length
  const title = clamp(`${name} Air Quality & Clean-Air Policy — ${SITE}`, 70)
  const description = clamp(
    `PM2.5 trends and clean-air policy impact for ${name}: ${count} policies tracked, SDID causal analysis with Glass-box uncertainty.`,
    200,
  )
  const jsonLd = [
    countryDatasetJsonLd(name, canonicalUrl, description, {
      countryCode: code,
      dateModified: impact?.generated_at ?? null,
      treatmentYear: impact?.treatment_year ?? null,
      // The real, live HF URL a crawler can fetch — see jsonld.ts's
      // CountryDatasetMeta comment for why this isn't built inside jsonld.ts.
      distributionContentUrl: `${POLICY_IMPACT_BASE}/${code}.json`,
    }),
    breadcrumbJsonLd([
      { name: 'Home', url: `${CANONICAL_ORIGIN}/` },
      { name: 'Insights', url: `${CANONICAL_ORIGIN}/insights` },
      { name, url: canonicalUrl },
    ]),
  ]
  return {
    title,
    description,
    canonicalUrl,
    robots: 'index, follow',
    ogType: 'website',
    jsonLd,
    bodyHtml: countryBodyHtml(reg, impact, name, canonicalUrl),
  }
}

// ── Blog post (original editorial) ──────────────────────────────────────────

/** SSR row shape for a blog post record (bilingual columns + reviewed sources). */
export interface BlogPostSeoRow {
  slug: string
  topic?: string | null
  /** Null for a Korean-original post — `title_ko` carries the only title. */
  title_en: string | null
  title_ko?: string | null
  dek_en?: string | null
  dek_ko?: string | null
  body_md_en?: string | null
  body_md_ko?: string | null
  hero_image?: string | null
  author?: string | null
  published_at?: string | null
  source_refs?: Array<{ type?: string | null; ref?: string | null; label?: string | null }> | null
}

/** ko-first locale resolution (the editorial desk publishes ko; en is the fallback). */
function blogText(ko: string | null | undefined, en: string | null | undefined): string | null {
  return (ko && ko.trim()) || (en && en.trim()) || null
}

/**
 * Index only posts that carry a real body — an original, crawlable article.
 * Body-less rows (should not happen for published) stay noindex.
 */
export function shouldIndexBlogPost(row: BlogPostSeoRow): boolean {
  return Boolean(blogText(row.body_md_ko, row.body_md_en))
}

function blogSourceRefsHtml(refs: BlogPostSeoRow['source_refs']): string {
  const items = (refs ?? [])
    .map((r) => {
      const label = r?.label ? escapeHtml(String(r.label)) : ''
      if (!label) return ''
      if (r?.type === 'news' && r.ref) return `<li><a href="/news/${escapeHtml(String(r.ref))}">${label}</a></li>`
      const url = safeHttpUrl(r?.ref)
      if (url) return `<li><a href="${escapeHtml(url)}" rel="nofollow noopener" target="_blank">${label}</a></li>`
      return `<li>${label}</li>`
    })
    .filter(Boolean)
    .join('')
  if (!items) return ''
  return (
    `<section aria-label="Reviewed sources"><p><strong>Sources reviewed</strong></p><ul>${items}</ul>` +
    `<p><small>AirLens editorial weaves these sources with our own first-party data (Glass-box: measurements &amp; SDID shown with uncertainty).</small></p></section>`
  )
}

function blogBodyHtml(row: BlogPostSeoRow, title: string, dek: string | null, body: string | null): string {
  const parts: string[] = [`<h1>${escapeHtml(title)}</h1>`]
  const meta = [row.author, row.published_at?.slice(0, 10)].filter(Boolean).map((x) => escapeHtml(String(x)))
  if (meta.length) parts.push(`<p class="ssr-meta">${meta.join(' · ')}</p>`)
  if (dek) parts.push(`<p class="ssr-lede">${escapeHtml(dek)}</p>`)
  // No markdown renderer is ported (this repo's client renders the body with
  // its own component — `BlogPost.tsx` — not a shared pure function like the
  // monorepo's `lib/markdown.ts renderMarkdown`). The crawler-visible body
  // gets the plain-text dek + a link to the full post rather than a second,
  // possibly-drifting markdown-to-HTML implementation.
  void body
  parts.push(blogSourceRefsHtml(row.source_refs))
  parts.push(`<p><a href="/blog">← Back to Blog</a></p>`)
  return `<main class="ssr-seo"><article>${parts.join('')}</article></main>`
}

export function blogPostPageSeo(row: BlogPostSeoRow, slug: string): PageSeo {
  // Both titles null would mean a post with no title at all; the slug is the
  // last honest label available rather than an empty <h1>.
  const title = blogText(row.title_ko, row.title_en) ?? slug
  const dek = blogText(row.dek_ko, row.dek_en)
  const body = blogText(row.body_md_ko, row.body_md_en)
  const canonicalUrl = `${CANONICAL_ORIGIN}/blog/${slug}`
  const description = clamp(dek || title, 200)
  const jsonLd = [
    blogPostingJsonLd(
      { slug, title, dek, hero_image: row.hero_image, author: row.author, published_at: row.published_at },
      canonicalUrl,
      description,
    ),
    breadcrumbJsonLd([
      { name: 'Home', url: `${CANONICAL_ORIGIN}/` },
      { name: 'Blog', url: `${CANONICAL_ORIGIN}/blog` },
      { name: title, url: canonicalUrl },
    ]),
  ]
  return {
    title: clamp(`${title} — ${SITE}`, 70),
    description,
    canonicalUrl,
    robots: shouldIndexBlogPost(row) ? 'index, follow' : 'noindex, follow',
    ogType: 'article',
    ogImage: safeHttpUrl(row.hero_image) ?? undefined,
    jsonLd,
    bodyHtml: blogBodyHtml(row, title, dek, body),
  }
}

// ── List pages (blog index / dispatch) ──────────────────────────────────────
// SSR prerender for the two collected-content list routes. Crawlers get real
// titles/links/excerpts; the SPA mounts over #root.

export interface BlogListRow {
  slug: string
  /** Null for a Korean-original post — `title_ko` carries the only title. */
  title_en: string | null
  title_ko?: string | null
  dek_en?: string | null
  dek_ko?: string | null
  author?: string | null
  published_at?: string | null
}

export function blogListPageSeo(rows: BlogListRow[]): PageSeo {
  const canonicalUrl = `${CANONICAL_ORIGIN}/blog`
  const pageTitle = clamp(`Blog — ${SITE}`, 70)
  const description =
    'Original air-quality analysis from the AirLens editorial desk — first-party measurements, satellite fusion, and SDID policy findings, always with uncertainty.'
  // Resolve the title first: filtering on `title_en` alone would drop every
  // Korean-original post — the whole archive, since the writer publishes ko.
  const entries = rows
    .map((r) => ({ row: r, title: blogText(r.title_ko, r.title_en) }))
    .filter((e): e is { row: BlogListRow; title: string } => Boolean(e.row.slug && e.title))
  const items = entries.map((e) => ({
    name: e.title,
    url: `${CANONICAL_ORIGIN}/blog/${e.row.slug}`,
  }))
  const lis = entries
    .map(({ row: r, title }) => {
      const dek = blogText(r.dek_ko, r.dek_en)
      const meta = [r.author, r.published_at?.slice(0, 10)]
        .filter(Boolean)
        .map((m) => escapeHtml(String(m)))
        .join(' · ')
      return (
        `<li><a href="/blog/${escapeHtml(r.slug)}">${escapeHtml(title)}</a>` +
        (meta ? ` <small>${meta}</small>` : '') +
        (dek ? `<p>${escapeHtml(dek)}</p>` : '') +
        `</li>`
      )
    })
    .join('')
  return {
    title: pageTitle,
    description,
    canonicalUrl,
    // An empty list page is a thin shell — keep it out of the index.
    robots: entries.length > 0 ? 'index, follow' : 'noindex, follow',
    ogType: 'website',
    jsonLd: [
      collectionPageJsonLd(pageTitle, description, canonicalUrl, items),
      breadcrumbJsonLd([
        { name: 'Home', url: `${CANONICAL_ORIGIN}/` },
        { name: 'Blog', url: canonicalUrl },
      ]),
    ],
    bodyHtml:
      `<main class="ssr-seo"><h1>AirLens Blog</h1>` +
      `<p>${escapeHtml(description)}</p>` +
      `<ul>${lis}</ul></main>`,
  }
}

// ── Today ───────────────────────────────────────────────────────────────────

// Deterministic crawler copy for /today. The page's LIVE readouts are
// per-visitor (geolocation) so the SSR layer never fabricates a location or a
// number — it explains what the instrument measures and how to read it. The
// FAQ text mirrors the Glass-box vocabulary (p10-p90, DQSS).
const TODAY_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'What does the Today page show?',
    a: 'Real-time PM2.5 at your coordinates, fused from ground monitors and satellite aerosol data (AOD), with current weather, nearby pollutant levels (PM10, O₃, NO₂), and a 24-48h forecast. If you decline location access you can enter coordinates manually or pick a major city.',
  },
  {
    q: 'What is the p10-p90 range next to the PM2.5 number?',
    a: 'AirLens reports an uncertainty band, not a single point: p10 and p90 are the 10th and 90th percentiles of the estimate. A wide band means the sources disagree or coverage is thin — the honest answer is a range.',
  },
  {
    q: 'What is a DQSS grade?',
    a: 'The Data Quality Scoring System grades every reading A-F by source agreement, sensor density, and freshness. A missing grade renders as "—", never as a fabricated value.',
  },
  {
    q: 'Where does the data come from?',
    a: 'Ground observations, satellite aerosol optical depth (MODIS), and weather from Open-Meteo. Every card on the page names its source.',
  },
]

export function todayPageSeo(): PageSeo {
  const canonicalUrl = `${CANONICAL_ORIGIN}/today`
  const pageTitle = clamp(`Today — real-time air quality at your location — ${SITE}`, 70)
  const description =
    'Real-time PM2.5 for your coordinates with an honest p10-p90 uncertainty band, DQSS data-quality grade, weather, nearby pollutants and a 48h forecast — satellite and ground sources, always credited.'
  const faqHtml = TODAY_FAQS.map((f) => `<h2>${escapeHtml(f.q)}</h2><p>${escapeHtml(f.a)}</p>`).join('')
  const h1 = 'Today — your sky, read as an instrument'
  return {
    title: pageTitle,
    description,
    canonicalUrl,
    robots: 'index, follow',
    ogType: 'website',
    jsonLd: [
      faqPageJsonLd(TODAY_FAQS),
      breadcrumbJsonLd([
        { name: 'Home', url: `${CANONICAL_ORIGIN}/` },
        { name: 'Today', url: canonicalUrl },
      ]),
    ],
    bodyHtml:
      `<main class="ssr-seo"><h1>${escapeHtml(h1)}</h1>` +
      `<p>${escapeHtml(description)}</p>` +
      faqHtml +
      `</main>`,
  }
}

// ── Insights ────────────────────────────────────────────────────────────────

// Deterministic crawler copy for /insights. The page's selection-driven charts
// are CSR; the SSR layer explains the methodology — what SDID estimates, how
// to read ATT with a 95% CI, and what DQSS grades mean — in the Glass-box
// vocabulary, never fabricating a result.
const INSIGHTS_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'What does the Insights page show?',
    a: 'Causal estimates of how air-quality policies changed PM2.5, country by country. Each analyzed policy gets an SDID (synthetic difference-in-differences) comparison of observed PM2.5 against a synthetic counterfactual built from peer countries.',
  },
  {
    q: 'What is ATT and how should I read it?',
    a: 'ATT is the Average Treatment effect on the Treated — the estimated change in PM2.5 (µg/m³) attributable to the policy, relative to the synthetic control. Always read it with its 95% confidence interval: if the interval crosses zero, AirLens flags the effect as not established rather than claiming one.',
  },
  {
    q: 'What is the synthetic control (counterfactual)?',
    a: 'A weighted blend of countries that did not adopt the policy, chosen so its pre-policy PM2.5 trend matches the treated country. The gap after the treatment year is the estimated effect. Countries without a credible counterfactual show "—" instead of a number.',
  },
  {
    q: 'What is a DQSS grade on a policy estimate?',
    a: 'The Data Quality Scoring System grades each estimate A-F by panel coverage, source agreement, and pre-treatment fit. Lower grades mean the estimate rests on thinner data — the grade is shown next to every ATT, never hidden.',
  },
  {
    q: 'Where does the data come from?',
    a: 'PM2.5 panels from CAMS reanalysis and ground networks (OpenAQ, national monitors), policy dates from official government records, and news sentiment from the AirLens dispatch corpus. Every chart names its sources.',
  },
]

export function insightsPageSeo(): PageSeo {
  const canonicalUrl = `${CANONICAL_ORIGIN}/insights`
  const pageTitle = clamp(`Insights — Policy Impact on PM2.5 — ${SITE}`, 70)
  const description =
    'Did the policy change the air? SDID causal estimates of air-quality policy effects across dozens of countries — ATT with a 95% confidence interval, DQSS data-quality grades, and the uncertainty kept visible.'
  const faqHtml = INSIGHTS_FAQS.map((f) => `<h2>${escapeHtml(f.q)}</h2><p>${escapeHtml(f.a)}</p>`).join('')
  const h1 = 'Insights — did the policy change the air?'
  return {
    title: pageTitle,
    description,
    canonicalUrl,
    robots: 'index, follow',
    ogType: 'website',
    jsonLd: [
      faqPageJsonLd(INSIGHTS_FAQS),
      breadcrumbJsonLd([
        { name: 'Home', url: `${CANONICAL_ORIGIN}/` },
        { name: 'Insights', url: canonicalUrl },
      ]),
    ],
    bodyHtml:
      `<main class="ssr-seo"><h1>${escapeHtml(h1)}</h1>` +
      `<p>${escapeHtml(description)}</p>` +
      faqHtml +
      `</main>`,
  }
}

export interface NewsListRow {
  slug: string | null
  title: string
  summary?: string | null
  summary_en?: string | null
  summary_ko?: string | null
  source_name?: string | null
  published_at?: string | null
}

export function dispatchListPageSeo(rows: NewsListRow[]): PageSeo {
  const canonicalUrl = `${CANONICAL_ORIGIN}/dispatch`
  const pageTitle = clamp(`Dispatch — air-quality news — ${SITE}`, 70)
  const description =
    'Air-quality reporting from around the world, summarized by AirLens and linked to our own measurements and policy analysis. Sources are always credited.'
  // Slug-less legacy rows have no detail route — never emit dead links.
  const entries = rows.filter((r): r is NewsListRow & { slug: string } => Boolean(r.slug && r.title))
  const items = entries.map((r) => ({ name: r.title, url: `${CANONICAL_ORIGIN}/news/${r.slug}` }))
  const lis = entries
    .map((r) => {
      const summary = r.summary_en ?? r.summary_ko ?? r.summary
      const meta = [r.source_name, r.published_at?.slice(0, 10)]
        .filter(Boolean)
        .map((m) => escapeHtml(String(m)))
        .join(' · ')
      return (
        `<li><a href="/news/${escapeHtml(r.slug)}">${escapeHtml(r.title)}</a>` +
        (meta ? ` <small>${meta}</small>` : '') +
        (summary ? `<p>${escapeHtml(clamp(summary, 240))}</p>` : '') +
        `</li>`
      )
    })
    .join('')
  return {
    title: pageTitle,
    description,
    canonicalUrl,
    robots: entries.length > 0 ? 'index, follow' : 'noindex, follow',
    ogType: 'website',
    jsonLd: [
      collectionPageJsonLd(pageTitle, description, canonicalUrl, items),
      breadcrumbJsonLd([
        { name: 'Home', url: `${CANONICAL_ORIGIN}/` },
        { name: 'Dispatch', url: canonicalUrl },
      ]),
    ],
    bodyHtml:
      `<main class="ssr-seo"><h1>Dispatch</h1>` +
      `<p>${escapeHtml(description)}</p>` +
      `<ul>${lis}</ul></main>`,
  }
}
