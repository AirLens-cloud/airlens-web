# airlens-public-api

Keyless, read-only public data API + MCP server for AirLens (W8-b/c). A thin,
versioned, rate-limited, documented facade over the **already-public** static
snapshots published to the HF dataset `Robeedau/airlens-live` under `aq-data/**`
(DQSS W4, 2026-09-03 — moved off the Cloudflare Pages `/data/**` mirror, which
no longer republishes every snapshot the models pipeline writes). **Zero
database load** — every response reshapes a static JSON snapshot fetched from
`DATA_ORIGIN` with edge caching.

## Endpoints (`/v1`)

| Method | Path | Source snapshot | Provenance |
|---|---|---|---|
| GET | `/v1/health` | — | synthetic liveness + dataset index |
| GET | `/v1/grid/latest?variable=pm25\|pm10\|o3\|no2\|co` | `current-<var>-grid.json` | **model-forecast** (NOAA GEFS-Aerosols, NOT AirLens ML) |
| GET | `/v1/predictions/cities` | `predictions/grid_latest.json` | **inferred** — AirLens ML, p10/p50/p90 + `confidence_grade` |
| GET | `/v1/predictions/cities/{name}` | ↑ filtered | same |
| GET | `/v1/stations` | `data_quality.json` | **inferred** (subject_provenance: observed) — DQSS score over ground-station readings; `dqss_grade` is null unless `measured_weight >= 60/100` |
| GET | `/v1/ontology/summary` | `catalog.ts` | machine-readable data catalog |
| GET | `/v1/openapi.json` | generated | OpenAPI 3.1 spec |
| GET/POST | `/mcp` | ↑ same data | MCP server (streamable HTTP, JSON-RPC 2.0) |

### Glass-box honesty
Provenance is declared per dataset in `catalog.ts` and never conflated:
- the pollutant grid is a re-hosted **NOAA model forecast** (no per-cell uncertainty / DQSS);
- city predictions carry a **coverage disclosure** (nominal 80% interval, validated PICP ~73%, epistemic-only);
- the in-sample registry r² is deliberately **not** published.

## MCP tools
`get_city_predictions`, `get_city_prediction`, `get_pollutant_at` (nearest 1° cell),
`get_stations`, `get_catalog`.

## Rate limiting (3 layers)
1. **Edge cache** — every GET sets `Cache-Control: s-maxage`, so most traffic never runs the worker.
2. **Per-IP limit** (`ratelimit.ts`) — Cloudflare's native [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) (`IP_RATE_LIMIT`, declared as `[[ratelimits]]` in `wrangler.toml`): 120 requests per 60 s per client IP, `429` past that. Fails **open** (the request is allowed) when the binding is unbound (`wrangler dev`, tests), when there is no client IP, or when the limiter call throws — that last case is logged as `rate limiter unavailable, failing open`.
3. **Cloudflare Rate Limiting Rule** (dashboard, 1 rule) — outer volumetric wall (~600 req/min/IP recommended).

The per-IP limit is approximate: Cloudflare counts per location and syncs in the background, so a burst can overshoot and a client spread across locations gets a budget in each. The binding answers allow/deny only, so `RateLimit-Limit` is sent on every response but `RateLimit-Remaining` only on the `429` (as `0`), and `Retry-After` is the whole window. The numbers appear twice in `wrangler.toml` — the binding's `limit`/`period` enforce them, `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_SECONDS` only feed those headers — so change them together.

## Deploy (operator, gated)
The **Deploy Public API Worker** workflow runs on every push to `main` that touches
`workers/public-api/**` and on manual dispatch — merging a change here deploys it
(type-check and tests first, then `wrangler deploy`).

`wrangler.toml` carries the per-IP limiter binding (`[[ratelimits]]`), so there is
nothing to provision for layer 2. (It replaced a KV namespace, `RL_KV`, that needed
`wrangler kv namespace create`; the deploy no longer binds it.)

1. Bind a route / custom domain (e.g. `api.airlens.cloud/*`) in the Cloudflare
   dashboard. Deliberately not in `wrangler.toml`: a `routes` entry for a hostname
   with no DNS record fails the deploy outright.
2. (optional) Add one Cloudflare Rate Limiting Rule (layer 3).
3. After a deploy, verify `GET /v1/health` returns 200 live. After changing the
   limiter also check that a burst from one IP gets a `429` — the binding is not
   shown in the dashboard, and a missing binding fails open without an error.

No secrets: this worker only reshapes the already-public `aq-data/**` snapshots, so
`wrangler secret put` is not part of setup (contrast the chatbot worker).

Local: `npm run type-check && npm test` · `npm run dev`.

License: AGPL-3.0-or-later.
