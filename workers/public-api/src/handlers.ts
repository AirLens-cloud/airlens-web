/**
 * handlers.ts — pure data handlers for each /v1 dataset. Each returns the JSON
 * payload plus an edge-cache TTL; index.ts owns HTTP framing (headers, CORS,
 * rate limiting). Handlers are pure over (env, params) so they unit-test with a
 * stubbed fetch and no Worker runtime.
 */

import type { Env, GridVariable } from './types';
import { fetchSnapshot, UpstreamError } from './upstream';
import {
  API_DESCRIPTION,
  API_TITLE,
  API_VERSION,
  DATASETS,
  GRADE_CUTOFF_LABELS,
  GRID_VARIABLES,
  PREDICTION_COVERAGE,
  isGridVariable,
} from './catalog';

export interface HandlerResult {
  data: Record<string, unknown>;
  cacheTtlSeconds: number;
}

/** Epoch ms → ISO, or null. Finite-but-out-of-range values (a corrupt
 *  timestamp in µs/ns) make `new Date().toISOString()` throw RangeError, so
 *  guard that too rather than 500 on bad upstream data. */
export function iso(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

// ── /v1/grid/latest?variable=pm25 ───────────────────────────────────────────
interface GridSnapshot {
  variable: string;
  resolution: number;
  timestamp: number;
  nLat: number;
  nLon: number;
  latMin: number;
  lonMin: number;
  dLat: number;
  dLon: number;
  points: { lat: number; lon: number; value: number }[];
  source: string;
}

export async function handleGrid(env: Env, variable: string): Promise<HandlerResult> {
  if (!isGridVariable(variable)) {
    throw new UpstreamError(
      `unknown variable '${variable}'. supported: ${GRID_VARIABLES.map((g) => g.variable).join(', ')}`,
      400,
    );
  }
  const meta = GRID_VARIABLES.find((g) => g.variable === (variable as GridVariable))!;
  const snap = await fetchSnapshot<GridSnapshot>(env, `/aq-data/current-${meta.file}-grid.json`, 600);

  return {
    cacheTtlSeconds: 600,
    data: {
      dataset: 'pollutant-grid',
      variable: meta.variable,
      label: meta.label,
      unit: meta.unit,
      provenance: 'model-forecast',
      source: snap.source,
      disclaimer:
        'Numerical model forecast (not AirLens ML). No per-cell uncertainty or DQSS grade.',
      as_of: iso(snap.timestamp),
      grid: {
        resolution_deg: snap.resolution,
        n_lat: snap.nLat,
        n_lon: snap.nLon,
        lat_min: snap.latMin,
        lon_min: snap.lonMin,
        d_lat: snap.dLat,
        d_lon: snap.dLon,
      },
      count: Array.isArray(snap.points) ? snap.points.length : 0,
      points: Array.isArray(snap.points) ? snap.points : [],
    },
  };
}

// ── /v1/predictions/cities[/{name}] ─────────────────────────────────────────
interface PredictionRow {
  name: string;
  lat: number;
  lon: number;
  timestamp: string;
  predicted_p10: number;
  predicted_p50: number;
  predicted_p90: number;
  uncertainty: number;
  observed_pm25?: number | null;
  model_version: string;
  source: string;
  confidence_grade: string | null;
  [k: string]: unknown;
}
interface PredictionSnapshot {
  generated_at: string;
  model_version: string;
  model_available: boolean;
  count: number;
  predictions: PredictionRow[];
}

/** Shared coverage disclosure attached to every prediction response.
 *  `empirical_picp_n` / `empirical_picp_measured_at` / `empirical_picp_source` travel
 *  with the percentage so a consumer never sees a bare number without knowing how much
 *  to trust it and where the full band-by-band breakdown lives (see catalog.ts). */
const coverageBlock = {
  nominal_interval_pct: PREDICTION_COVERAGE.nominalPct,
  empirical_picp_pct: PREDICTION_COVERAGE.empiricalPicpPct,
  empirical_picp_n: PREDICTION_COVERAGE.empiricalN,
  empirical_picp_measured_at: PREDICTION_COVERAGE.measuredAt,
  empirical_picp_source: PREDICTION_COVERAGE.measuredVia,
  note: PREDICTION_COVERAGE.note,
};

function shapePrediction(p: PredictionRow) {
  return {
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    as_of: p.timestamp ?? null,
    pm25: {
      p10: p.predicted_p10,
      p50: p.predicted_p50,
      p90: p.predicted_p90,
      unit: 'µg/m³',
    },
    observed_pm25: p.observed_pm25 ?? null,
    confidence_grade: p.confidence_grade ?? null,
    model_version: p.model_version,
    source: p.source,
  };
}

export async function handlePredictions(env: Env): Promise<HandlerResult> {
  const snap = await fetchSnapshot<PredictionSnapshot>(
    env,
    '/aq-data/predictions/grid_latest.json',
    300,
  );
  const rows = Array.isArray(snap.predictions) ? snap.predictions : [];
  return {
    cacheTtlSeconds: 300,
    data: {
      dataset: 'city-predictions',
      provenance: 'inferred',
      source: 'AirLens ML (AOD→PM2.5 ensemble)',
      generated_at: snap.generated_at ?? null,
      model_version: snap.model_version ?? null,
      model_available: snap.model_available ?? false,
      coverage: coverageBlock,
      count: rows.length,
      cities: rows.map(shapePrediction),
    },
  };
}

export async function handleCityPrediction(env: Env, name: string): Promise<HandlerResult> {
  const snap = await fetchSnapshot<PredictionSnapshot>(
    env,
    '/aq-data/predictions/grid_latest.json',
    300,
  );
  const rows = Array.isArray(snap.predictions) ? snap.predictions : [];
  const wanted = name.trim().toLowerCase();
  const row = rows.find((p) => String(p.name ?? '').toLowerCase() === wanted);
  if (!row) {
    throw new UpstreamError(`no prediction for city '${name}'`, 404);
  }
  return {
    cacheTtlSeconds: 300,
    data: {
      dataset: 'city-predictions',
      provenance: 'inferred',
      source: 'AirLens ML (AOD→PM2.5 ensemble)',
      generated_at: snap.generated_at ?? null,
      coverage: coverageBlock,
      city: shapePrediction(row),
    },
  };
}

// ── /v1/stations ────────────────────────────────────────────────────────────
// DQSS W4 (2026-09-03): the engine (models/dqss/rule_based_dqss.py) is the sole
// grade authority — `badge` already accounts for `measured_weight` suppression
// (badge=null when measured_weight < 60/100). Re-deriving a grade from a raw
// `final_score` here (the pre-W4 behaviour) would ignore that suppression and
// hand out a confident letter grade for a station the engine itself refuses to
// grade — the exact failure mode this whole DQSS campaign exists to close.
interface StationRow {
  station_id: string;
  lat: number;
  lon: number;
  final_score: number | null;
  measured_weight: number;
  badge: string | null;
  freshness: number | null;
  completeness: number | null;
  consistency: number | null;
  stability: number | null;
  model_residual: number | null;
  reasons?: Record<string, string>;
  [k: string]: unknown;
}
interface StationSnapshot {
  meta: { source?: string; generated_at?: string; note?: string };
  stations: StationRow[];
}

/** meta.source values that mean "no real scores in this payload" (P0 pattern). */
const WITHHELD_SOURCES = new Set(['seed', 'withheld']);

export async function handleStations(env: Env): Promise<HandlerResult> {
  const snap = await fetchSnapshot<StationSnapshot>(env, '/aq-data/data_quality.json', 600);
  const withheld = WITHHELD_SOURCES.has(snap.meta?.source ?? '');
  // Don't trust the upstream invariant that a withheld/seed snapshot always ships
  // an empty stations array — enforce it here too, so a producer-side contract
  // slip can never leak scores through a status:"withheld" response.
  const rows = withheld ? [] : Array.isArray(snap.stations) ? snap.stations : [];
  return {
    cacheTtlSeconds: 600,
    data: {
      dataset: 'station-quality',
      // The DQSS score is a *derived* quality metric over observed readings, not
      // itself a direct observation — the readings it scores are 'observed',
      // the score about them is 'inferred'. Conflating the two is what let a
      // synthetic 85/100 pass as a live measurement before the 2026-09 rewrite.
      provenance: 'inferred',
      subject_provenance: 'observed',
      status: withheld ? 'withheld' : 'ok',
      source: snap.meta?.source ?? 'AirLens DQSS snapshot',
      disclaimer:
        'final_score (0–100) is renormalised over measured components only — read it ' +
        'together with measured_weight, never alone. dqss_grade is null unless ' +
        'measured_weight >= 60/100 (grade_cutoffs are for the badge system, not a ' +
        'blanket score-to-letter mapping).',
      generated_at: snap.meta?.generated_at ?? null,
      grade_cutoffs: GRADE_CUTOFF_LABELS,
      count: rows.length,
      stations: rows.map((s) => ({
        station_id: s.station_id,
        lat: s.lat,
        lon: s.lon,
        final_score: s.final_score ?? null,
        measured_weight: s.measured_weight ?? null,
        dqss_grade: s.badge ?? null,
        components: {
          freshness: s.freshness ?? null,
          completeness: s.completeness ?? null,
          consistency: s.consistency ?? null,
          stability: s.stability ?? null,
          model_residual: s.model_residual ?? null,
        },
        reason: s.reasons ?? {},
      })),
    },
  };
}

// ── /v1/ontology/summary ─────────────────────────────────────────────────────
export function handleOntologySummary(): HandlerResult {
  return {
    cacheTtlSeconds: 3600,
    data: {
      api: { title: API_TITLE, version: API_VERSION, description: API_DESCRIPTION },
      provenance_kinds: {
        observed: 'Direct station measurement.',
        interpolated: 'Grid interpolation / reanalysis sample.',
        'model-forecast': 'Numerical model forecast (GFS / GEFS / CAMS).',
        'satellite-derived': 'Satellite estimate (e.g. AOD → PM2.5, FRP).',
        inferred: 'Causal/derived estimate (e.g. AirLens ML, SDID).',
      },
      dqss_grade_cutoffs: GRADE_CUTOFF_LABELS,
      datasets: DATASETS.map((d) => ({
        id: d.id,
        title: d.title,
        endpoint: d.endpoint,
        provenance: d.provenance,
        source: d.source,
        cadence: d.cadence,
        uncertainty: d.uncertainty ?? null,
        license: d.license,
      })),
    },
  };
}

// ── /v1/health ────────────────────────────────────────────────────────────────
export function handleHealth(): HandlerResult {
  return {
    cacheTtlSeconds: 0,
    data: {
      status: 'ok',
      api: API_TITLE,
      version: API_VERSION,
      datasets: DATASETS.map((d) => d.endpoint),
    },
  };
}
