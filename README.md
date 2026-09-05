# airlens-web

AirLens's web product, serving [airlens.cloud](https://airlens.cloud) via
Cloudflare Pages. The original monorepo (`AirLens-platform`, now
`AirLens-cloud/AirLens`, private) runs the data + ML pipeline only — its
`apps/web` retired 2026-09-02 (tag `web-retired-2026-09`), and this repo has
been the sole web product since. It remains a separate, read-only consumer
of the pipeline's output: the public Hugging Face dataset
[`Robeedau/airlens-live`](https://huggingface.co/datasets/Robeedau/airlens-live),
with a small CDN/static fallback chain for when that dataset is unreachable.
No backend of its own beyond two Cloudflare Workers (a keyless community-API
proxy and the Field Assistant chat worker, `workers/assistant/`) — data
flows one way: collectors in AirLens-platform publish, this app fetches and
reads.

The public surface runs on the Instrument Panel design system (typography
scale, 7-bar brand mark, gauge-style hero, chart grammar — see
`docs/design-reports/`) across Home, Globe, Today, Insights (24h PM2.5
forecast band), Dispatch/News, Blog, country profiles, Datasets/Data
sources, Trust, Legal/About/FAQ, Methodology/Glossary/Learn, a cinematic
`/landing` flight, and a floating Field Assistant chat widget site-wide.
Two pages are deliberately inert pre-launch surfaces with honest empty/
feasibility states rather than placeholder content: Research (Research
Commons index — zero published receipts, by design) and Lab (Local
Research Studio — feasibility review not yet passed). `/design` and
`/probe` are internal/dev-only routes, not part of the public product.

ML/forecast surfaces follow the Glass-box principle — uncertainty ranges
and DQSS quality badges (`DqssBadge`), never a bare point estimate.

## Stack

React 19 · TypeScript (strict) · Vite · Vitest · Zustand · ESLint (flat config)

## Development

```bash
npm install
npm run dev          # Vite dev server
npm run build         # tsc -b && vite build
npm run lint          # eslint .
npm run typecheck     # tsc -b --noEmit
npm run test          # vitest (watch)
npm run test:run      # vitest (CI)
```

First-time setup (git hooks — gitleaks secret scan on commit):

```bash
npm run setup-hooks
```

## Data sources

`src/lib/config/dataSources.ts` is the single hardcoding-avoidance point for
both base URLs (override via `.env.local`, see `.env.example`):

- `VITE_HF_LIVE_BASE` — the HF dataset repo resolve URL (`Robeedau/airlens-live`).
  Primary source for every feed: AQ/weather/marine/pollen grids, wind fields,
  the PM2.5 timeline, the 24h forecast, and the global grid snapshot.
- `VITE_SNAPSHOT_CDN_BASE` — the PM2.5/PM10 grid fallback path. Defaults to a
  path on the same HF dataset repo (`mac-data/data/web/v1/`, published by
  AirLens-platform's `mac-data-publish.yml`) — the earlier free-tier GitHub
  Pages mirror (`joymin5655.github.io`) was retired in the 2026-09 org
  transfer and now 404s; only set this to point somewhere else.

Every fetch module in `src/api/` and `src/lib/today/` follows the same honesty
rule ported from the source repo: never fabricate a "now" timestamp when the
source payload doesn't carry one, and return `null`/throw rather than
substitute fake data when every source in a fallback chain fails.

Two more base URLs (also `.env.example`, both optional) cover the two
Cloudflare Workers this app talks to:

- `VITE_COMMUNITY_API_BASE` — a keyless, 30-minute-cache API Worker the
  Weather page proxies through (`/api/proxy/open-meteo-weather`,
  `/api/proxy/open-meteo-aq`). Empty/unset renders an honest "not
  configured" state instead of attempting a request against nothing.
- `VITE_ASSISTANT_API_BASE` — the Field Assistant Worker (`workers/assistant/`,
  session issuance + SSE chat, RAG + intent classification). Set to empty
  (not unset) to force the chat widget's disabled "coming back soon" state —
  no scripted/fake conversation is ever rendered, same Glass-box rule.

## Docs

- [`docs/FLUID.md`](docs/FLUID.md) — fluid interface spec (springs, glass tiers, `Materialize`, capsule, orb) for porting into Today/Globe/Insights.

## Ported modules

The data layer below was the initial M0 port from AirLens-platform's
(now-retired) `apps/web`; the UI has since been built out on top of it
through several design waves (`docs/design-reports/`). Kept here as a record
of provenance for the fetch/health modules, which are largely unchanged.

| Module | Source (AirLens-platform apps/web) | Notes |
|---|---|---|
| `api/airQualityGrid.ts` | `src/api/airQualityGrid.ts` | Supabase Edge Function on-demand step removed — chain is now HF → CDN → static only |
| `api/weather.ts` | `src/api/weather.ts` | `fetchWindField` port; other exports are dead-stub parity |
| `api/gridSnapshot.ts` | `src/api/gridSnapshot.ts` | 1:1 port (already Supabase-free — replaces a retired Edge Fn) |
| `api/timeline.ts` | `src/api/timeline.ts` | 1:1 port |
| `lib/today/forecastSource.ts` | `src/lib/today/forecastSource.ts` | 1:1 port |
| `hooks/useDataHealth.ts` | `src/hooks/useDataHealth.ts` | 1:1 port, plus `lib/dataHealth.ts` / `lib/config/dataHealth.ts` / `store/dataHealthStore.ts` |
| `lib/config/feeds.ts` | `src/lib/config/globeOntology.ts` | Started as a pipeline-only subset (feed paths/varKeys); now the derived SOT for the Globe renderer's color scales, legends, and layer contracts too |

## Relationship to AirLens-platform

This repo started as an eventual `apps/web` candidate for the AirLens-platform
npm workspace. That merge-back never happened: `apps/web` there retired
2026-09-02 (tag `web-retired-2026-09`) and AirLens-platform (now
`AirLens-cloud/AirLens`, private) is the data + ML pipeline only — this repo
is the permanent, standalone web product, with its own independent
TypeScript/Vite/plugin versions and lockfile (already diverged — this repo
runs Vite 8, the monorepo pinned Vite 7). It still imports nothing from
`packages/shared-types` or `packages/design-tokens`; the two codebases share
no build-time dependency, only the one-way HF dataset feed described above.

One convention survives from that earlier plan and is still worth keeping:
every import in `src/` stays relative, no `@/*` alias
(`grep -r "from '@/'" src` returns nothing) — it costs nothing and keeps
any future file move (within this repo or elsewhere) a plain cut-and-paste.

**Keep `public/_headers` and `public/_redirects` in the build output.** A
Cloudflare Pages deploy replaces the target project's files wholesale, so
these are what carry the security headers and SPA fallback on every deploy.
See the comments in each file.
