# airlens-web

The web app behind **[airlens.cloud](https://airlens.cloud)**: free, no-account global air-quality observation, with the uncertainty (p10–p90) and data-quality grade (DQSS) shown next to every estimate.

[![Live](https://img.shields.io/badge/Live-airlens.cloud-blue?style=flat-square)](https://airlens.cloud)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square)](LICENSE)

## What is in this repo

| Path | What it is | Deploys to |
|---|---|---|
| `src/` | React 19 + Vite 7 + TypeScript single-page app, including the Three.js globe | Cloudflare Pages project `airlens` |
| `functions/` | Pages Functions: `today`, `insights`, `dispatch`, `blog/`, `news/`, `country/`, `data/`, dynamic sitemap, edge middleware | Same Pages project |
| `workers/assistant/` | The air-quality interpretation assistant (`airlens-assistant`): Workers AI with Vectorize retrieval, guardrails, KV quota, rate limiting, chat logs to R2 | Cloudflare Worker |
| `public/` | Static assets plus a baked data snapshot used as a fallback (see [`docs/DATA-SNAPSHOT.md`](docs/DATA-SNAPSHOT.md)) | Pages |

The app does not run its own data pipeline. It reads the public Hugging Face dataset [`Robeedau/airlens-live`](https://huggingface.co/datasets/Robeedau/airlens-live), which the `airlens-data` collectors publish. The base URL is set in `src/lib/config/dataSources.ts` and can be overridden with `VITE_HF_LIVE_BASE`.

## Develop

```bash
npm ci
npm run dev          # Vite dev server
npm run build        # prefetch fallback data, type-check, build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run lint:design  # design-token lint
npm run test:run     # Vitest
```

The assistant Worker has its own package:

```bash
cd workers/assistant
npm ci
npx vitest run
```

Activate the pre-commit secret scan once per clone with `npm run setup-hooks`.

## Deploy

| Workflow | Trigger | What it does |
|---|---|---|
| `deploy.yml` | push to `main`, manual | Builds and uploads to Cloudflare Pages, then verifies the deployment |
| `ci.yml` | push / PR to `main` | Type-check, lint, design lint, tests, build, gitleaks |
| `assistant-generation-smoke.yml` | push / PR touching the assistant | Live generation gates for the assistant |
| `assistant-model-ab.yml`, `cf-account-probe.yml` | manual | Model A/B evaluation, Cloudflare account checks |

Organization-wide architecture (repos, data flow, free-tier budget) lives in the AirLens organization docs.

## Scholarly evidence

AirLens-platform is the producer of the versioned scholarly-claim contract. This app checks in its public-safe output at `public/data/evidence/scholarly_claims.v1.json` and renders the same records on Methodology, Research, Trust, and model-card surfaces. The browser never calls Scite: only stable identifiers, AirLens review decisions, review dates, limitations, and links to AirLens evaluation artifacts cross the public boundary. Keep this static copy byte-identical to the producer artifact when a reviewed evidence PR is accepted.

## License

AGPL-3.0. See [`LICENSE`](LICENSE), [`NOTICE`](NOTICE) and [`ATTRIBUTION.md`](ATTRIBUTION.md). Upstream data keeps its original license.
