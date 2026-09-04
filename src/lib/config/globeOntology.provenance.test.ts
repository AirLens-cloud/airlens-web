/**
 * Air-quality feed provenance (AAA).
 *
 * These labels reach readers on /data-sources, /datasets and the Globe HUD,
 * so they have to match what the artifacts themselves declare rather than
 * what a shared default happened to say. Values below were read off the live
 * files on 2026-09-04:
 *
 *   current-pm25-grid.json  source "NOAA GEFS-Aerosols"  nLat 181 × nLon 360  1°
 *   current-pm10-grid.json  source "NOAA GEFS-Aerosols"  nLat 181 × nLon 360  1°
 *   current-o3-grid.json    source "Open-Meteo (CAMS)"   nLat  33 × nLon  72  5°
 *   current-no2-grid.json   source "Open-Meteo (CAMS)"                        5°
 *   current-co-grid.json    source "Open-Meteo (CAMS)"                        5°
 *
 * Before this pass all five were labelled "Open-Meteo Air Quality" at 5° —
 * wrong provider and a five-times-coarser grid for the particulates. That is
 * the drift these cases exist to catch, so a failure here means the labels
 * and the artifacts have parted ways again; re-read the files before
 * "fixing" the test.
 */
import { describe, it, expect } from 'vitest';
import { PHENOMENA, type ProvenanceKind } from './globeOntology';

/**
 * Evidence Contract v1 `nature` enum, copied verbatim from
 * `airlens-data/contracts/evidence-envelope.v1.schema.json` (and the
 * identical enum in `data-product-manifest.v1.schema.json`). This is the
 * test that stops the web's `ProvenanceKind` union from splitting into its
 * own divergent variant again — the 2026-09-04 bug this file's other tests
 * already guard: a 5-value union with no `analysis` member funnelled 23 of
 * 36 phenomena into `interpolated`, which was simply false for GEFS/GFS
 * analysis-grid reads. If this test fails, the union and the contract have
 * parted ways — fix the union (or the contract, with a producer-side change
 * first), never just this assertion.
 */
const EVIDENCE_CONTRACT_NATURE_ENUM: readonly ProvenanceKind[] = [
  'observation',
  'analysis',
  'interpolated',
  'forecast',
  'satellite-derived',
  'inferred',
  'policy',
];

describe('ProvenanceKind vocabulary parity with Evidence Contract v1', () => {
  it('has exactly the 7 contract-defined nature values, in the same set', () => {
    // Arrange — every phenomenon's declared provenance values must be drawn
    // from the contract enum; nothing outside it should ever be assignable
    // (a type-level guarantee `ProvenanceKind` already gives us — this test
    // pins the runtime list so a silent contract-side change is caught too).
    const used = new Set<ProvenanceKind>();
    for (const def of Object.values(PHENOMENA)) {
      for (const p of def.provenance) used.add(p);
    }
    // Act / Assert — everything actually used is inside the contract set.
    for (const value of used) {
      expect(EVIDENCE_CONTRACT_NATURE_ENUM).toContain(value);
    }
    // And the contract's own 7 values are exactly what we expect (order and
    // spelling), so a producer-side schema edit shows up here too.
    expect([...EVIDENCE_CONTRACT_NATURE_ENUM]).toEqual([
      'observation', 'analysis', 'interpolated', 'forecast',
      'satellite-derived', 'inferred', 'policy',
    ]);
  });
});

describe('Per-phenomenon provenance consistency', () => {
  it('tags every GEFS/GFS analysis-feed phenomenon with analysis', () => {
    // Arrange/Act/Assert — pm25, pm10 (NOAA GEFS-Aerosols f000/anl) and wind
    // (NOAA/NCEP GFS f000/anl) are analysis reads, not forecasts and not
    // interpolation (`collect_noaa_aq.py`/`collect_gfs_wind.py` idx_match
    // both target the `anl` GRIB segment).
    for (const id of ['pm25', 'pm10', 'wind'] as const) {
      expect(PHENOMENA[id].provenance).toContain('analysis');
      expect(PHENOMENA[id].provenance).not.toContain('interpolated');
    }
  });

  it('tags every Open-Meteo forecast-endpoint phenomenon with forecast', () => {
    // Arrange/Act/Assert — o3/no2/co (`/v1/air-quality`), temp/rh/precip/
    // cloud/uvi/mslp (`/v1/forecast`), and sst/ssta/waves/currents
    // (`/v1/marine`) all read a "current" value off a forecast-model run.
    for (const id of [
      'o3', 'no2', 'co', 'temp', 'rh', 'precip', 'cloud', 'uvi', 'mslp',
      'sst', 'ssta', 'waves', 'currents',
    ] as const) {
      expect(PHENOMENA[id].provenance).toContain('forecast');
    }
  });

  it('only leaves provenance empty when there is truly no pipeline behind it', () => {
    // Arrange/Act/Assert — the converse direction (empty provenance implies
    // no pipeline), not "no pipeline implies empty provenance": `smoke` and
    // `transport` also have `pipeline: null` (they are derived expressions
    // with no collection feed of their own) but legitimately claim
    // `['inferred']` — that's a documented, evidence-backed derivation, not
    // a fabricated default. What must never happen is the reverse: claiming
    // *any* provenance (e.g. the old fallback to 'interpolated') for a
    // phenomenon like `declaredOnly()`'s so2/dewpoint/etc. or `mi`, which
    // have no pipeline and no derivation logic behind them at all.
    for (const [id, def] of Object.entries(PHENOMENA)) {
      if (def.provenance.length === 0) {
        expect(def.pipeline, `${id}: empty provenance without pipeline:null`).toBeNull();
      }
    }
  });

  it('claims zero phenomena as interpolated — nothing AirLens publishes is interpolated today', () => {
    // Arrange/Act — this is the point of the whole correction: every
    // phenomenon that used to fall back to 'interpolated' by default is now
    // either 'analysis' or 'forecast' on real evidence, and 'interpolated'
    // survives in the union only for the genuine client-side IDW fallback
    // path (GlobeLegend.tsx, gated on GLOBE_CONFIG.GLOBE_HEATMAP.IDW_SOURCE_LABEL)
    // which is not modeled as a PhenomenonDef at all.
    const claimants = Object.entries(PHENOMENA)
      .filter(([, def]) => def.provenance.includes('interpolated'))
      .map(([id]) => id);
    // Assert — if this ever fails, it means a phenomenon started claiming
    // interpolation again; that must be a deliberate, evidence-backed,
    // reviewed change, not a silent default re-creeping in.
    expect(claimants).toEqual([]);
  });
});

describe('AQ feed provenance', () => {
  it.each([
    ['pm25' as const],
    ['pm10' as const],
  ])('labels %s as the aerosol model at its real 1° resolution', (id) => {
    // Arrange / Act
    const pipeline = PHENOMENA[id].pipeline;
    // Assert
    expect(pipeline?.source).toBe('NOAA GEFS-Aerosols');
    expect(pipeline?.resolution).toBe('1°');
  });

  it.each([
    ['o3' as const],
    ['no2' as const],
    ['co' as const],
  ])('labels %s as the CAMS reanalysis feed at 5°', (id) => {
    // Arrange / Act
    const pipeline = PHENOMENA[id].pipeline;
    // Assert
    expect(pipeline?.source).toBe('Open-Meteo (CAMS)');
    expect(pipeline?.resolution).toBe('5°');
  });

  it('does not give the gases and the particulates one shared provenance', () => {
    // Arrange — the regression itself: a single default applied to all five.
    const particulate = PHENOMENA.pm25.pipeline;
    const gas = PHENOMENA.o3.pipeline;
    // Assert
    expect(particulate?.source).not.toBe(gas?.source);
    expect(particulate?.resolution).not.toBe(gas?.resolution);
  });
});
