// Shared SSR page handlers, one per crawlable route. Each route file under
// functions/ (blog/index.ts, blog/[slug].ts, news/[slug].ts, country/[code].ts,
// dispatch.ts, insights.ts, today.ts) is a thin one-liner over these.
//
// Ported from AirLens-platform apps/web `functions/_lib/pageHandlers.ts` (Wave
// 1, plan airlens-airlens-web-2-curious-chipmunk). The source parameterized
// each handler by `UrlLocale` (`makeXHandler(lang)`) for its `/ko` URL tree;
// this repo has no `/ko` routes, so the factory wrapper is dropped and each
// handler is exported directly.

import {
  fetchArticleBySlug,
  fetchCountryImpact,
  fetchCountryData,
  fetchBlogPostForSeo,
  fetchBlogListForSeo,
  fetchNewsListForSeo,
  type Env,
} from './data'
import { renderSeoShell } from './render'
import {
  articlePageSeo,
  countryPageSeo,
  blogPostPageSeo,
  blogListPageSeo,
  dispatchListPageSeo,
  todayPageSeo,
  insightsPageSeo,
} from '../../src/lib/seo/pageSeo'

export interface Ctx {
  request: Request
  env: Env
  params: Record<string, string | string[]>
  next: () => Promise<Response>
}

type Handler = (ctx: Ctx) => Promise<Response>

function param(ctx: Ctx, key: string): string {
  const raw = ctx.params?.[key]
  return (Array.isArray(raw) ? raw[0] : raw) ?? ''
}

async function fetchShell(ctx: Ctx): Promise<Response> {
  return ctx.env.ASSETS.fetch(new URL('/index.html', ctx.request.url).toString())
}

function isReadRequest(ctx: Ctx): boolean {
  return ctx.request.method === 'GET' || ctx.request.method === 'HEAD'
}

/** /news/:slug — NewsArticle meta + JSON-LD + crawler-visible content. */
export const newsArticleHandler: Handler = async (ctx) => {
  if (!isReadRequest(ctx)) return ctx.next()
  const slug = param(ctx, 'slug')
  const shell = await fetchShell(ctx)
  if (!slug) return shell
  const article = await fetchArticleBySlug(slug)
  if (!article) return shell
  // AirLens's own SDID/PM2.5 data for the article's country (Server-Collect:
  // the HF live dataset, guarded). Missing/invalid country → summary only.
  const impact = article.country_code ? await fetchCountryImpact(article.country_code) : null
  return renderSeoShell(shell, articlePageSeo(article, slug, { impact }))
}

/** /country/:code — Dataset + breadcrumb JSON-LD + SDID policy analysis. */
export const countryHandler: Handler = async (ctx) => {
  if (!isReadRequest(ctx)) return ctx.next()
  const code = param(ctx, 'code')
  const shell = await fetchShell(ctx)
  if (!code) return shell
  const data = await fetchCountryData(code)
  if (!data) return shell
  return renderSeoShell(shell, countryPageSeo(data.registry, data.impact))
}

/** /blog/:slug — original post meta + JSON-LD + crawler-visible body. */
export const blogPostHandler: Handler = async (ctx) => {
  if (!isReadRequest(ctx)) return ctx.next()
  const slug = param(ctx, 'slug')
  const shell = await fetchShell(ctx)
  if (!slug) return shell
  const post = await fetchBlogPostForSeo(slug)
  if (!post) return shell
  return renderSeoShell(shell, blogPostPageSeo(post, slug))
}

/** /blog — list meta + CollectionPage JSON-LD + crawler-visible post list. */
export const blogListHandler: Handler = async (ctx) => {
  if (!isReadRequest(ctx)) return ctx.next()
  const shell = await fetchShell(ctx)
  const rows = await fetchBlogListForSeo()
  if (!rows || rows.length === 0) return shell
  return renderSeoShell(shell, blogListPageSeo(rows))
}

/** /today — deterministic meta + FAQPage JSON-LD (no per-visitor data). */
export const todayHandler: Handler = async (ctx) => {
  if (!isReadRequest(ctx)) return ctx.next()
  const shell = await fetchShell(ctx)
  return renderSeoShell(shell, todayPageSeo())
}

/** /insights — deterministic methodology meta + FAQPage JSON-LD. */
export const insightsHandler: Handler = async (ctx) => {
  if (!isReadRequest(ctx)) return ctx.next()
  const shell = await fetchShell(ctx)
  return renderSeoShell(shell, insightsPageSeo())
}

/** /dispatch — news-list meta + CollectionPage JSON-LD + crawler-visible list. */
export const dispatchHandler: Handler = async (ctx) => {
  if (!isReadRequest(ctx)) return ctx.next()
  const shell = await fetchShell(ctx)
  const rows = await fetchNewsListForSeo()
  if (!rows || rows.length === 0) return shell
  return renderSeoShell(shell, dispatchListPageSeo(rows))
}
