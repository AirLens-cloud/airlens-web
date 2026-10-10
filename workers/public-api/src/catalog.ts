/**
 * catalog.ts — the data catalog the public API exposes, and the single place
 * where each dataset's provenance is declared. `/v1/ontology/summary` serves
 * this verbatim, and the OpenAPI/MCP descriptions read from it, so the API can
 * never advertise a dataset without also stating how it is known.
 *
 * Glass-box honesty (mirrors apps/web/src/lib/config/globeOntology.ts):
 *  - The pollutant grid is a re-hosted NOAA model forecast, NOT AirLens ML.
 *    It carries no per-cell uncertainty or DQSS — saying otherwise would be a
 *    fabricated confidence signal.
 *  - City predictions ARE the AirLens ML output (p10/p50/p90 + confidence_grade).
 *    The served band's own interval coverage (PICP) is measured as of 2026-09-03:
 *    77.1% overall from 5,283 independent forward pairs, below the 80% nominal
 *    target — the catalog ships that measurement (and its band-by-band caveats)
 *    next to the dataset instead of burying it (see PREDICTION_COVERAGE).
 *  - Station scores are the DQSS quality snapshot; `dqss_grade` is the engine's
 *    own badge vocabulary (High/Medium/Low/Unreliable, `s.badge` passed through
 *    verbatim — see handlers.ts), which the producer (models/dqss) owns and the
 *    API never re-derives.
 */

import type { GridVariable, Provenance } from './types';

/** Badge cutoffs as labels for API responses — mirrors the engine's own
 *  `QualityBadge.from_score` (models/models/dqss/rule_based_dqss.py:76-83:
 *  High >=80, Medium >=50, Low >=20, Unreliable <20). This is documentation
 *  only: the API reads `s.badge` from the upstream snapshot verbatim and never
 *  recomputes a grade from `final_score`, so these labels must stay in lockstep
 *  with the engine's real cutoffs by hand — there is no shared import across
 *  the Python/TS boundary. */
export const GRADE_CUTOFF_LABELS: Record<string, string> = {
  High: '>=80',
  Medium: '>=50',
  Low: '>=20',
  Unreliable: '<20',
};

/** Nominal vs measured coverage of the city-prediction intervals.
 *  Mirrors GLOBE_CONFIG.ML_PREDICTIONS.COVERAGE / CityPredictionCard.
 *
 *  `empiricalPicpPct` used to be null on purpose (`~73%` traced to no artifact, and a
 *  later CV of the deployed architecture couldn't stand in either — see history below).
 *  It is no longer null: 2026-09-03's b6 data-plane migration (OpenAQ HF feed) shipped
 *  `models/eval/aod/gate_accumulator.py`, which pairs each published prediction against
 *  a genuinely independent **+1h-later** observation (not the value the model was fed)
 *  and accumulates across every published snapshot. That closes the gap the CV couldn't:
 *  it measures the *deployed* artifact under its *actual* serving inputs, not a retrained
 *  estimator on a wider feature set.
 *
 *  `empiricalN` / `measuredAt` / `measuredVia` travel with the number so a consumer can
 *  tell how much it should trust it, and where to find the full band-by-band breakdown —
 *  the same discipline the pre-2026-09 prose already asked for: never publish an
 *  aggregate without the per-band split. That split is disclosed in `note`, not summarised
 *  away: the high bands are either too thin to trust (n=67, n=9) or still zero (n=0), and
 *  aggregating over concentration would hide exactly that.
 *
 *  Pre-2026-09-03 history, kept because it answers a *different* question (how the same
 *  deployed artifact behaves under two weaker, offline validations) and the reasoning
 *  still holds:
 *
 *  1. A leave-station-out CV of the blend+GTWR architecture (`models/eval/aod/serving_cv.py`,
 *     PICP80 88.2%) does not describe this band: `aod_pm25_v2.pkl` was fitted on 106
 *     feature columns, but the serving feature builder supplies only 31 of them, and
 *     `predict_cities()` zero-fills the rest (`fd.get(c, 0.0)` — predict_grid.py:506).
 *     75 inputs, 70.8%, are constant 0 at serve time, including all 64 location-embedding
 *     dimensions. The four AOD features the builder does compute are absent from the
 *     model's columns entirely, so the IDW interpolation feeding them is discarded.
 *  2. The published band tracks its own input when checked against the value it was fed
 *     (not a forward observation): across 64 points in a 2026-07-22 run, p50 reproduces
 *     the `observed_pm25` it was fed (corr 0.9993, MAE 0.24 µg/m³), median p10–p90 width
 *     1.00 µg/m³ — coverage of that same-input check is ~100% by construction, not
 *     forecast skill. This is why `empiricalPicpPct` is built from forward (+1h,
 *     independent) pairing instead.
 *  3. Running the deployed artifact under serving conditioning over 150k rows of the
 *     feature parquet: PICP80 is 0.890 overall, but 0.506 above 75 µg/m³ and 0.000 above
 *     150, with p50 low by 72 and 186 µg/m³ respectively — an offline echo of the same
 *     band-dependent collapse the live forward check now shows directly. */
export const PREDICTION_COVERAGE = {
  nominalPct: 80,
  empiricalPicpPct: 77.1,
  empiricalN: 5283,
  measuredAt: '2026-09-03',
  measuredVia:
    'models/eval/aod/reports/gate_accumulator_baseline_2026-09-03.json ' +
    '(eval.aod.gate_accumulator — 9 published snapshots, independent +1h OpenAQ forward observations)',
  note:
    "The p10–p90 band is a nominal 80% interval. Its own empirical coverage (PICP) is now " +
    "measured: 77.1% overall, from 5,283 independently paired points across 9 published " +
    "snapshots (measured on 2026-09-03) — the paired observation is a genuine +1h-later " +
    "reading, not the value the model was fed. That is below the 80% nominal target. " +
    "Coverage is not uniform in concentration: the ≥35 µg/m³ slice reaches 95.5% but on " +
    "only 67 pairs — below the 200-pair threshold this catalog treats as reliable — the " +
    "≥75 µg/m³ slice is 100% on just 9 pairs, and the ≥150 µg/m³ slice has zero pairs in " +
    "this window and remains unmeasured. Do not read those high-band figures as " +
    "calibration; n this small is noise, not a guarantee. Full breakdown and methodology: " +
    "models/eval/aod/reports/gate_accumulator_baseline_2026-09-03.json. The measurements " +
    "below predate this forward check and describe a related but different question — how " +
    "the same deployed artifact behaves under two other, weaker validations — kept for " +
    "that reason, not as a substitute for the figure above. " +
    'Cross-validation of the same estimator architecture reaches 88.2%, but the ' +
    'deployed model is fed only 31 of the 106 feature columns it was fitted on — the remaining ' +
    '70.8%, including every location-embedding dimension, arrive as zeros — so that figure does ' +
    'not describe this band. Two things make an aggregate coverage number misleading here. ' +
    'First, the band tracks its own input: across the last published run the median p10–p90 ' +
    'width is 1.00 µg/m³ and p50 reproduces the observation it was fed (corr 0.9993, MAE ' +
    '0.24 µg/m³), so the interval brackets the input rather than forecasting an unknown. ' +
    'Second, coverage is not uniform in concentration — measured on the deployed artifact under ' +
    'serving inputs it is 0.890 overall but 0.506 above 75 µg/m³ and 0.000 above 150 µg/m³, ' +
    'where p50 runs 72–186 µg/m³ low. Do not rely on this band at hazardous concentrations. ' +
    'Treat it as a lower bound on uncertainty, never as a guarantee. ' +
    'Intervals are epistemic-only and can be narrower than real-world variability. ' +
    'The training-registry r² is a circular in-sample figure and is deliberately not published here.',
} as const;

/** One-line coverage disclosure for API/tool descriptions.
 *  Derived, never retyped — `openapi.ts` and `mcp.ts` had each hand-copied the prose,
 *  so the numbers drifted from this constant without any test noticing. */
export const COVERAGE_SUMMARY =
  `Nominal ${PREDICTION_COVERAGE.nominalPct}% intervals; measured empirical coverage is ` +
  `${PREDICTION_COVERAGE.empiricalPicpPct}% overall (${PREDICTION_COVERAGE.empiricalN.toLocaleString('en-US')} ` +
  `independent +1h pairs, ${PREDICTION_COVERAGE.measuredAt}) — below nominal, and treat it as a lower ` +
  'bound on uncertainty. Coverage at hazardous concentrations remains unmeasured or too thin to ' +
  'trust (n=9–67) — the band is narrow around the observation it is fed and under-covers sharply ' +
  'above 75 µg/m³ in earlier cross-validation; do not rely on it at hazardous concentrations.';

export interface GridVariableMeta {
  variable: GridVariable;
  /** Key in the snapshot filename: current-<file>-grid.json */
  file: string;
  label: string;
  unit: string;
}

/** The pollutant grids the /v1/grid endpoint can serve. Filenames verified
 *  against the HF dataset's aq-data/current-*-grid.json (DQSS W4). */
export const GRID_VARIABLES: readonly GridVariableMeta[] = [
  { variable: 'pm25', file: 'pm25', label: 'PM2.5 mass concentration', unit: 'µg/m³' },
  { variable: 'pm10', file: 'pm10', label: 'PM10 mass concentration', unit: 'µg/m³' },
  { variable: 'o3', file: 'o3', label: 'Ozone', unit: 'µg/m³' },
  { variable: 'no2', file: 'no2', label: 'Nitrogen dioxide', unit: 'µg/m³' },
  { variable: 'co', file: 'co', label: 'Carbon monoxide', unit: 'µg/m³' },
];

export function isGridVariable(v: string): v is GridVariable {
  return GRID_VARIABLES.some((g) => g.variable === v);
}

export interface DatasetEntry {
  id: string;
  title: string;
  endpoint: string;
  /** Upstream static snapshot path under DATA_ORIGIN. */
  snapshot: string;
  provenance: Provenance;
  /** Human statement of where the numbers come from. */
  source: string;
  /** Update cadence, best-effort — the snapshot's own timestamp is authoritative. */
  cadence: string;
  /** Present only when the dataset carries a real uncertainty signal. */
  uncertainty?: string;
  license: string;
}

/**
 * The catalog. Each entry is honest about provenance; endpoints and OpenAPI are
 * generated from it so documentation cannot drift from what is actually served.
 */
export const DATASETS: readonly DatasetEntry[] = [
  {
    id: 'pollutant-grid',
    title: 'Global pollutant forecast grid (1°)',
    endpoint: '/v1/grid/latest',
    snapshot: '/aq-data/current-{variable}-grid.json',
    provenance: 'model-forecast',
    source:
      'NOAA GEFS-Aerosols numerical forecast, re-hosted on a 1° lat/lon grid. This is a model product, not AirLens ML, and carries no per-cell uncertainty or DQSS grade.',
    cadence: 'Refreshed with the upstream GEFS cycle (snapshot timestamp is authoritative).',
    license: 'NOAA (U.S. public domain); AirLens re-hosting under AGPL-3.0-or-later.',
  },
  {
    id: 'city-predictions',
    title: 'AirLens city PM2.5 predictions',
    endpoint: '/v1/predictions/cities',
    snapshot: '/aq-data/predictions/grid_latest.json',
    provenance: 'inferred',
    source:
      'AirLens ML (AOD→PM2.5, xgb/lgb/GTWR ensemble). Each city carries p10/p50/p90 quantiles and a confidence_grade.',
    cadence: 'Refreshed when the prediction snapshot is republished (generated_at is authoritative).',
    uncertainty:
      `p10–p90 nominal ${PREDICTION_COVERAGE.nominalPct}% interval; measured empirical coverage is ` +
      `${PREDICTION_COVERAGE.empiricalPicpPct}% (n=${PREDICTION_COVERAGE.empiricalN.toLocaleString('en-US')}, ` +
      `${PREDICTION_COVERAGE.measuredAt}) — below nominal. Coverage at hazardous concentrations is thinner ` +
      'still or unmeasured; see PREDICTION_COVERAGE.note for the full band-by-band breakdown.',
    license: 'AGPL-3.0-or-later.',
  },
  {
    id: 'station-quality',
    title: 'Station data-quality (DQSS) snapshot',
    endpoint: '/v1/stations',
    snapshot: '/aq-data/data_quality.json',
    // The underlying readings are 'observed'; the DQSS score *about* them is a
    // derived/inferred metric (see handleStations' subject_provenance field).
    provenance: 'inferred',
    source:
      'Ground-station observations (subject_provenance: observed), scored by the DQSS ' +
      'rule-based quality model. dqss_grade is null unless measured_weight >= 60/100 — ' +
      'a thin-evidence station is left ungraded, never handed a middle-of-the-road letter.',
    cadence: 'Refreshed with the DQSS snapshot (meta.generated_at is authoritative).',
    uncertainty:
      'final_score is a data-quality score renormalised over measured components only; ' +
      'read it together with measured_weight, never alone.',
    license: 'Per-station source terms; AirLens scoring under AGPL-3.0-or-later.',
  },
];

export const API_VERSION = 'v1';
export const API_TITLE = 'AirLens Public Data API';
export const API_DESCRIPTION =
  'Keyless, read-only access to AirLens air-quality snapshots. Every dataset states its provenance; ' +
  'model forecasts, ML predictions, and station quality scores are labeled distinctly and never conflated.';
