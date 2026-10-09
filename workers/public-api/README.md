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
2. **KV per-IP counter** (`ratelimit.ts`) — fixed window, `429` past `RATE_LIMIT_MAX`. Fails **open** if `RL_KV` is unbound.
3. **Cloudflare Rate Limiting Rule** (dashboard, 1 rule) — outer volumetric wall (~600 req/min/IP recommended).

## Deploy (operator, gated)
Deploy is `workflow_dispatch`-only until infra is provisioned.

`wrangler.toml` now exists and `wrangler deploy --dry-run` passes, so **step 4 works
today** — the worker lands on its `workers.dev` URL with the edge-cache and
dashboard rate-limit layers active and the KV per-IP layer failing open. Steps 1–3
harden it; none of them blocks a first deploy.

1. `npx wrangler kv namespace create RL_KV` → paste the printed id into
   `wrangler.toml` and uncomment the `[[kv_namespaces]]` block (layer 2).
2. Bind a route / custom domain (e.g. `api.airlens.cloud/*`) in the Cloudflare
   dashboard. Deliberately not in `wrangler.toml`: a `routes` entry for a hostname
   with no DNS record fails the deploy outright.
3. (optional) Add one Cloudflare Rate Limiting Rule (layer 3).
4. Run the **Deploy Public API Worker** workflow, then verify `GET /v1/health`
   returns 200 live.

No secrets: this worker only reshapes the already-public `aq-data/**` snapshots, so
`wrangler secret put` is not part of setup (contrast the chatbot worker).

Local: `npm run type-check && npm test` (40 tests) · `npm run dev`.

License: AGPL-3.0-or-later.
