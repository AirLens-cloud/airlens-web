/**
 * Runtime bindings + shared shapes for the public API worker.
 *
 * The worker never touches the database. Every handler reshapes a static
 * snapshot fetched from `env.DATA_ORIGIN` (the same already-public JSON the HF
 * dataset `Robeedau/airlens-live` serves under aq-data/**), so there are no
 * secrets here — only the CORS allowlist, the rate-limit budget, and an
 * optional rate-limit binding.
 */

export interface Env {
  /** Origin serving the static aq-data/** snapshots (default the HF dataset
   *  `Robeedau/airlens-live`'s resolve/main URL — DQSS W4, 2026-09-03). */
  DATA_ORIGIN: string;
  /** Per-IP request budget (per RATE_LIMIT_WINDOW_SECONDS), reported as
   *  RateLimit-Limit. Mirrors the `limit` of wrangler.toml's `[[ratelimits]]`,
   *  which is what actually enforces it — keep the two equal. */
  RATE_LIMIT_MAX: string;
  /** Window length in seconds (drives Retry-After). Mirrors the `period` of
   *  `[[ratelimits]]` — keep the two equal. */
  RATE_LIMIT_WINDOW_SECONDS: string;
  /** Comma-separated CORS allowlist. "*" allows any origin. */
  ALLOWED_ORIGINS: string;
  /** Cloudflare native Rate Limiting binding (wrangler.toml `[[ratelimits]]`).
   *  Absent in dev/test → per-IP layer fails open. */
  IP_RATE_LIMIT?: RateLimit;
}

/** A pollutant grid variable the /v1/grid endpoint can serve. */
export type GridVariable = 'pm25' | 'pm10' | 'o3' | 'no2' | 'co';

/** How a served quantity is known — mirrors globeOntology ProvenanceKind. */
export type Provenance =
  | 'observed'
  | 'interpolated'
  | 'model-forecast'
  | 'satellite-derived'
  | 'inferred';
