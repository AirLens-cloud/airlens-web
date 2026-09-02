/**
 * External data source base URLs — single hardcoding-avoidance point.
 * Ported verbatim from AirLens-platform apps/web `src/lib/config/dataSources.ts`.
 *
 * `SNAPSHOT_CDN_BASE` points at the mac free-tier publish
 * (AirLens-platform `.github/workflows/mac-data-publish.yml`), converted to
 * the web Globe's `AQGridResponse` contract by `scripts/etl/build_web_aq_grid.py`
 * and landed at `mac-data/data/web/v1/current-{pm25,pm10}-grid.json` on the HF
 * dataset repo (moved off GitHub Pages ahead of the monorepo going private).
 * It is the pm25/pm10-only CDN fallback in the fetch cascade — a distinct
 * publish pipeline from the `aq-data/...` feeds below, same HF repo.
 *
 * `HF_LIVE_BASE` points at the public HF dataset repo (`Robeedau/airlens-live`)
 * that is this repo's data primary (the AirLens-platform monorepo now owns the
 * data pipeline only; this repo is a read-only consumer). Repo paths mirror
 * the former Supabase Storage bucket layout (`aq-data/...`, `wind-data/...`)
 * — the resolve URL is that path appended verbatim, no auth needed (public
 * repo, CDN-served).
 */
// `import.meta.env` is a Vite build-time injection, present in the SPA bundle
// but `undefined` when this module is pulled into a Cloudflare Pages Function
// (Wrangler's esbuild bundler doesn't inject it) — the optional chain avoids
// throwing at Function startup (`functions/_lib/data.ts`, Wave 1 SSR port).
export const SNAPSHOT_CDN_BASE: string =
  import.meta.env?.VITE_SNAPSHOT_CDN_BASE ??
  'https://huggingface.co/datasets/Robeedau/airlens-live/resolve/main/mac-data/data/web/v1';

export const HF_LIVE_BASE: string =
  import.meta.env?.VITE_HF_LIVE_BASE ?? 'https://huggingface.co/datasets/Robeedau/airlens-live/resolve/main';

/**
 * SDID policy-impact feed base — single source for the one path 3 call
 * sites need (`src/api/policy.ts`, `functions/_lib/data.ts`, and
 * `src/lib/seo/pageSeo.ts`'s country JSON-LD `distribution.contentUrl`).
 * Previously duplicated as a private literal in the first two; a country
 * hub's Dataset JSON-LD once emitted a *different*, never-published path
 * (`${CANONICAL_ORIGIN}/data/policy-impact/{cc}.json`) that 404s, since it
 * was hand-typed instead of sourced from here (code review finding, Wave 1
 * SSR port). If this path ever moves, this is the only place to update.
 */
export const POLICY_IMPACT_BASE: string = `${HF_LIVE_BASE}/insights-data/policy-impact`;

/**
 * Community API Worker (keyless, 30-minute cached proxy over Open-Meteo) —
 * the Weather page's `/api/proxy/open-meteo-weather` and
 * `/api/proxy/open-meteo-aq` routes live here. Public and keyless, so it gets
 * the same baked-in default as the two bases above: leaving it to an env var
 * nobody sets is what shipped every Weather card as "unavailable".
 *
 * The empty-base branch downstream (`weatherProxy.ts` skipping the fetch,
 * `useWeatherPageData`'s `configured: false`, and the five section states it
 * feeds) is now reachable ONLY via an explicit `VITE_COMMUNITY_API_BASE=`
 * override. Nobody sets that — so treat it as a guard against a future
 * misconfiguration, kept covered by tests that force it, not as a state the
 * shipped app reaches. Do not read those branches as evidence the Weather
 * page has a live "not configured" mode; it does not.
 *
 * Note the worker answers only origins on its CORS allowlist (AirLens-platform
 * `apps/web/workers/api/wrangler.toml` `ALLOWED_ORIGINS`), which does not
 * include localhost — `npm run dev` gets a 403 here, deployed builds do not.
 */
export const COMMUNITY_API_BASE: string =
  import.meta.env?.VITE_COMMUNITY_API_BASE ?? 'https://airlens.cloud';
