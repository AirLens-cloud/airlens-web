// /data/* guard — turns a missing static fallback file into an honest 404.
//
// Pages Functions run ahead of static-asset serving and the SPA catch-all in
// `public/_redirects` (`/* /index.html 200`). Without this route, a missing
// `/data/*` path (e.g. a fallback JSON file that was never generated, or
// briefly failed to regenerate — see scripts/prefetch-fallback-data.mjs)
// falls through to that catch-all and comes back 200 + the index.html shell.
// Every client-side fetcher in the fallback cascade (src/api/gridSnapshot.ts,
// src/lib/today/forecastSource.ts, src/api/weather.ts) then either throws
// deep inside a JSON.parse() or — worse — silently accepts whatever shape
// `res.ok` let through. This route intercepts every `/data/*` request,
// delegates to the real asset binding, and rejects anything that isn't a
// genuine non-HTML 200.

interface Env {
  ASSETS: { fetch: (input: Request) => Promise<Response> }
}

interface Ctx {
  request: Request
  env: Env
}

export const onRequest = async (ctx: Ctx): Promise<Response> => {
  const res = await ctx.env.ASSETS.fetch(ctx.request)
  const contentType = res.headers.get('content-type') ?? ''
  if (res.ok && !contentType.includes('text/html')) return res

  const path = new URL(ctx.request.url).pathname
  return new Response(JSON.stringify({ error: 'not_found', path }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  })
}
