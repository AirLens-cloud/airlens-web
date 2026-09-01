# airlens-web

Ground-up rebuild of the AirLens web product. The original monorepo
(`AirLens-platform`) now runs the data pipeline only; this repo is a
separate, read-only consumer of its output — the public Hugging Face
dataset [`Robeedau/airlens-live`](https://huggingface.co/datasets/Robeedau/airlens-live),
with a small CDN/static fallback chain for when that dataset is unreachable.
No backend of its own, no Supabase — data flows one way: collectors in
AirLens-platform publish, this app fetches and reads.

This is an M0 bootstrap: the data layer is ported and tested, but the UI is
intentionally unstyled (`src/pages/DataProbe.tsx`) — a real design system
lands in a later milestone.

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
- `VITE_SNAPSHOT_CDN_BASE` — a free-tier GitHub Pages mirror, PM2.5/PM10 grid
  fallback only (published hourly by AirLens-platform's `mac-data-publish.yml`).

Every fetch module in `src/api/` and `src/lib/today/` follows the same honesty
rule ported from the source repo: never fabricate a "now" timestamp when the
source payload doesn't carry one, and return `null`/throw rather than
substitute fake data when every source in a fallback chain fails.

## Docs

- [`docs/FLUID.md`](docs/FLUID.md) — fluid interface spec (springs, glass tiers, `Materialize`, capsule, orb) for porting into Today/Globe/Insights.

## Ported modules

| Module | Source (AirLens-platform apps/web) | Notes |
|---|---|---|
| `api/airQualityGrid.ts` | `src/api/airQualityGrid.ts` | Supabase Edge Function on-demand step removed — chain is now HF → CDN → static only |
| `api/weather.ts` | `src/api/weather.ts` | `fetchWindField` port; other exports are dead-stub parity |
| `api/gridSnapshot.ts` | `src/api/gridSnapshot.ts` | 1:1 port (already Supabase-free — replaces a retired Edge Fn) |
| `api/timeline.ts` | `src/api/timeline.ts` | 1:1 port |
| `lib/today/forecastSource.ts` | `src/lib/today/forecastSource.ts` | 1:1 port |
| `hooks/useDataHealth.ts` | `src/hooks/useDataHealth.ts` | 1:1 port, plus `lib/dataHealth.ts` / `lib/config/dataHealth.ts` / `store/dataHealthStore.ts` |
| `lib/config/feeds.ts` | `src/lib/config/globeOntology.ts` | Pipeline-only subset (feed paths/varKeys) — the source module's visual grammar (color scales, legends, layer contracts) has no Globe renderer to serve here yet |

## Staying mergeable back into AirLens-platform

This repo is expected to end up as `apps/web` inside the AirLens-platform npm
workspace. That move is not scheduled, and nothing here should be shaped around
it — but three cheap conventions keep it from becoming expensive. They cost
nothing today and are easy to violate by accident.

- **No `@/*` import alias.** Every import in `src/` is relative today
  (`grep -r "from '@/'" src` returns nothing). Relative imports survive being
  moved wholesale into another tree; an alias has to be reconciled against the
  one `apps/web` already defines.
- **No Vite 8-only APIs in `vite.config.ts`.** The monorepo root pins
  `"vite": "7.3.6"` as an npm `overrides` entry, which applies to every
  workspace. Joining that workspace would force this app onto Vite 7. The
  config here is plugins + dev proxy + test config, all of which are version-
  agnostic; keeping it that way makes the version question a one-line decision
  later instead of a migration.
- **Keep `public/_headers` and `public/_redirects` in the build output.** A
  Cloudflare Pages deploy replaces the target project's files wholesale, so
  these are what carry the security headers and SPA fallback across a project
  switch. See the comments in each file.

Things deliberately *not* pre-aligned, because doing so now would cost more
than doing it at move time: the package name (`airlens-web` vs `airlens`),
TypeScript/Vite/plugin versions, the lockfile, and whether to consume
`packages/shared-types` and `packages/design-tokens`.
