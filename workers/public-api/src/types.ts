/**
 * Runtime bindings + shared shapes for the public API worker.
 *
 * The worker never touches the database. Every handler reshapes a static
 * snapshot fetched from `env.DATA_ORIGIN` (the same already-public JSON the HF
 * dataset `Robeedau/airlens-live` serves under aq-data/**), so there are no
 * secrets here — only the CORS allowlist, the rate-limit budget, and an
 * optional KV binding.
 */

export interface Env {
  /** Origin serving the static aq-data/** snapshots (default the HF dataset
   *  `Robeedau/airlens-live`'s resolve/main URL — DQSS W4, 2026-09-03). */
  DATA_ORIGIN: string;
  /** Per-IP request budget for the KV counter layer (per RATE_LIMIT_WINDOW_SECONDS). */
  RATE_LIMIT_MAX: string;
  RATE_LIMIT_WINDOW_SECONDS: string;
  /** Comma-separated CORS allowlist. "*" allows any origin. */
  ALLOWED_ORIGINS: string;
  /** Rate-limit counter store. Absent in dev/test → per-IP layer fails open. */
  RL_KV?: KVNamespace;
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
