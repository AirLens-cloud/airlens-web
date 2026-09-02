// /sitemap-dynamic.xml — live sitemap for collected content. Every source is
// the HF live dataset (see functions/_lib/data.ts). Only indexable entries are
// listed (shouldIndexArticle = has a real summary + differentiation anchor,
// shouldIndexBlogPost = has a real body), matching the per-page honesty gate.
//
// Ported from AirLens-platform apps/web `functions/sitemap-dynamic.xml.ts`
// (Wave 1, plan airlens-airlens-web-2-curious-chipmunk). The source emitted
// both an en and a /ko loc per URL with a 3-way hreflang alternate set; this
// repo has no /ko tree, so each URL gets one <url> entry and no hreflang
// block at all (an alternate set with only one real language is not a
// meaningful hreflang annotation).

import {
  fetchAllArticlesForSitemap,
  fetchAllBlogPostsForSitemap,
  fetchCountryCodesForSitemap,
  type Env,
} from './_lib/data'
import { CANONICAL_ORIGIN, escapeHtml } from '../src/lib/seo/jsonld'
import { shouldIndexArticle, shouldIndexBlogPost } from '../src/lib/seo/pageSeo'

interface Ctx {
  request: Request
  env: Env
  next: () => Promise<Response>
}

// Ported from the source's `NEWS_LIMIT` — a defensive cap against the
// sitemap protocol's 50,000-URL-per-file ceiling, dropped in the initial
// port (code review finding, Wave 1 SSR port). Applied to news + blog only,
// matching the source: country hubs are a closed, small set (ISO country
// codes) with no realistic path to that ceiling.
const NEWS_LIMIT = 5000

function urlEntry(loc: string, lastmod?: string | null): string {
  const mod = lastmod ? `\n    <lastmod>${escapeHtml(lastmod)}</lastmod>` : ''
  return `  <url>\n    <loc>${escapeHtml(loc)}</loc>${mod}\n  </url>`
}

async function newsUrls(): Promise<string[]> {
  const articles = await fetchAllArticlesForSitemap()
  return articles
    .slice(0, NEWS_LIMIT)
    .filter((a) => a.slug && shouldIndexArticle(a))
    .map((a) => urlEntry(`${CANONICAL_ORIGIN}/news/${a.slug}`, a.published_at))
}

async function blogUrls(): Promise<string[]> {
  const posts = await fetchAllBlogPostsForSitemap()
  return posts
    .slice(0, NEWS_LIMIT)
    .filter((p) => shouldIndexBlogPost(p))
    .map((p) => urlEntry(`${CANONICAL_ORIGIN}/blog/${p.slug}`, p.published_at))
}

async function countryUrls(): Promise<string[]> {
  const countries = await fetchCountryCodesForSitemap()
  return countries.map((c) => urlEntry(`${CANONICAL_ORIGIN}/country/${c.countryCode}`, c.lastUpdated))
}

export const onRequest = async (ctx: Ctx): Promise<Response> => {
  const { request, next } = ctx
  if (request.method !== 'GET' && request.method !== 'HEAD') return next()

  const [news, blog, countries] = await Promise.all([newsUrls(), blogUrls(), countryUrls()])
  const urls = [...news, ...blog, ...countries]
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, stale-while-revalidate=600',
    },
  })
}
