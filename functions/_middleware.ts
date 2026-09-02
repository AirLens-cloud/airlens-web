// Root Pages Functions middleware — canonical host enforcement.
//
// Ported verbatim from the retired monorepo web (apps/web/functions/_middleware.ts)
// for the cutover onto the existing `airlens` Pages project: airlens.pages.dev and
// airlens.cloud are the SAME project (pages.dev = default subdomain, cloud = custom
// domain), so the same content is reachable on both → duplicate content across
// domains (an AdSense "low value" signal, and split crawl equity). The canonical is
// airlens.cloud. 301 the production pages.dev host to it, same path.
//
// Only the exact production alias is redirected — preview builds
// (<hash>.airlens.pages.dev) are left reachable for QA. All other hosts (incl. the
// canonical, and this repo's own airlens-web.pages.dev while it still exists) fall
// through to the normal route/asset handling via next().

interface Ctx {
  request: Request
  next: () => Promise<Response>
}

const CANONICAL_HOST = 'airlens.cloud'
const REDIRECT_HOSTS = new Set(['airlens.pages.dev'])

export const onRequest = async (ctx: Ctx): Promise<Response> => {
  const url = new URL(ctx.request.url)
  if (REDIRECT_HOSTS.has(url.hostname)) {
    url.hostname = CANONICAL_HOST
    url.protocol = 'https:'
    url.port = ''
    return Response.redirect(url.toString(), 301)
  }
  return ctx.next()
}
