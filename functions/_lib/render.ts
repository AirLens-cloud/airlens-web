// SSR transform: take the built index.html shell and inject per-page SEO into
// it with Cloudflare's streaming HTMLRewriter — title / meta / canonical / OG /
// JSON-LD into <head>, and crawler-visible content into #root. The SPA mounts
// over #root on hydration, so humans get the full interactive page while
// crawlers (incl. non-Google AI crawlers that don't run JS) read real content.
//
// Ported from AirLens-platform apps/web `functions/_lib/render.ts` (Wave 1,
// plan airlens-airlens-web-2-curious-chipmunk). The source also set
// `<html lang>` and appended hreflang alternate `<link>`s for its `/ko` URL
// tree; this repo has no `/ko` routes (`PageSeo` here carries no `lang`/
// `alternate` fields), so that half of the source is dropped rather than
// ported dead. `index.html` here needed placeholder `<meta name="description">`
// / `<meta name="robots">` / `<link rel="canonical">` / OG / Twitter tags added
// for the same reason as the source's own comment below explains: HTMLRewriter
// `.on(selector, ...)` only fires for elements that already exist in the
// source HTML — it does not create new ones.

import type { PageSeo } from '../../src/lib/seo/pageSeo'

// Minimal local typings for the Cloudflare Workers HTMLRewriter global — avoids
// pulling @cloudflare/workers-types as a dependency (supply-chain surface).
interface RwElement {
  setInnerContent(content: string, opts?: { html: boolean }): void
  setAttribute(name: string, value: string): void
  append(content: string, opts?: { html: boolean }): void
}
interface Rewriter {
  on(selector: string, handlers: { element: (el: RwElement) => void }): Rewriter
  transform(response: Response): Response
}
declare const HTMLRewriter: { new (): Rewriter }

// Security note: the ONLY raw-HTML sinks are `head.append(...ld+json)` and the
// `#root` setInnerContent({html:true}) below — both fed pre-escaped strings
// (ldScriptJson neutralizes `</script>`, pageSeo escapeHtml-s every
// interpolation). All title/meta/attribute mutations use text/attribute mode,
// which HTMLRewriter (lol-html) entity-encodes automatically; do NOT switch
// them to {html:true}.
export function renderSeoShell(shell: Response, seo: PageSeo): Response {
  return new HTMLRewriter()
    .on('title', { element: (e) => e.setInnerContent(seo.title) })
    .on('meta[name="description"]', { element: (e) => e.setAttribute('content', seo.description) })
    .on('meta[name="robots"]', { element: (e) => e.setAttribute('content', seo.robots) })
    .on('link[rel="canonical"]', { element: (e) => e.setAttribute('href', seo.canonicalUrl) })
    .on('meta[property="og:url"]', { element: (e) => e.setAttribute('content', seo.canonicalUrl) })
    .on('meta[property="og:type"]', { element: (e) => e.setAttribute('content', seo.ogType) })
    .on('meta[property="og:title"]', { element: (e) => e.setAttribute('content', seo.title) })
    .on('meta[property="og:description"]', { element: (e) => e.setAttribute('content', seo.description) })
    .on('meta[name="twitter:title"]', { element: (e) => e.setAttribute('content', seo.title) })
    .on('meta[name="twitter:description"]', { element: (e) => e.setAttribute('content', seo.description) })
    .on('meta[property="og:image"]', {
      element: (e) => {
        if (seo.ogImage) e.setAttribute('content', seo.ogImage)
      },
    })
    .on('meta[name="twitter:image"]', {
      element: (e) => {
        if (seo.ogImage) e.setAttribute('content', seo.ogImage)
      },
    })
    .on('head', {
      element: (e) => {
        for (const ld of seo.jsonLd) {
          e.append(`<script type="application/ld+json">${ld}</script>`, { html: true })
        }
      },
    })
    .on('#root', { element: (e) => e.setInnerContent(seo.bodyHtml, { html: true }) })
    .transform(shell)
}
