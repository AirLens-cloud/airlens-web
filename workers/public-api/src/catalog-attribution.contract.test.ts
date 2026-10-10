/**
 * Coverage-attribution contract for the public API surface.
 *
 * Why this file exists: `openapi.ts` and `mcp.ts` each hand-retyped the coverage
 * prose instead of deriving it from `catalog.ts`. The existing tests
 * (`index.test.ts`, `mcp.test.ts`) pin the *response* numbers but never read that
 * prose, so a claim could drift from the constant with every check still green —
 * and it did: both said "validated PICP ~73%", a figure that traced to no artifact.
 *
 * The contract is bidirectional, following `band-attribution.contract.test.ts`:
 *   BANNED   — an unsourced coverage percentage must not reappear
 *   REQUIRED — the qualifying language must stay (deleting it reads as "verified")
 */
import { describe, expect, it } from 'vitest';

import { COVERAGE_SUMMARY, DATASETS, PREDICTION_COVERAGE } from './catalog';
import { buildOpenApi } from './openapi';
import { TOOLS } from './mcp';

/** Any concrete empirical-coverage claim that is not one of the vetted, sourced
 *  figures this file publishes. The nominal 80 is always legitimate; the current
 *  `empiricalPicpPct` is legitimate *because* it always carries `empiricalN` +
 *  `measuredAt` in the same breath (asserted below) — this guards against a
 *  *second*, unsourced number sneaking in beside it, which is exactly how the
 *  #1044 defect happened. Built from the constant itself so a future change to
 *  the measured value doesn't require hand-editing this regex. */
const MEASURED_PICP_PCT_ESCAPED = String(PREDICTION_COVERAGE.empiricalPicpPct).replace('.', '\\.');
const BANNED_COVERAGE_CLAIM = new RegExp(
  String.raw`(?:PICP|empirical coverage|measured coverage)[^.]{0,40}?\b(?!80\b|${MEASURED_PICP_PCT_ESCAPED}\b)\d{2}(?:\.\d+)?\s*%`,
  'i',
);
const BANNED_VERIFIED_LANGUAGE = /conformally verified|validated PICP|guaranteed coverage/i;

/** The exact defect this file exists to catch, generalised: a claim that the served
 *  band's *own aggregate* coverage "is unmeasured" / "has not been measured" — stale
 *  the moment a real figure exists. Scoped to "own ... coverage is/has ... unmeasured"
 *  so it does NOT flag the legitimate high-band caveats ("remains unmeasured" for the
 *  n=0 ≥150 µg/m³ slice, "Coverage at hazardous concentrations remains unmeasured") —
 *  those describe a *different, still-true* absence, not the aggregate this contract
 *  measures. `catalog.ts`'s `DATASETS[…].uncertainty` (served verbatim by
 *  `/v1/ontology/summary`) carried exactly this stale phrasing until 2026-09-03. */
const BANNED_STALE_UNMEASURED_CLAIM =
  /own (?:empirical|interval) coverage(?: \(PICP\))? (?:is|has)(?: never)? (?:been )?(?:not been measured|unmeasured)\b/i;

function prose(): string[] {
  const fromOpenApi = JSON.stringify(buildOpenApi('https://example.test'));
  const fromMcp = TOOLS.map((t) => t.description).join('\n');
  const fromDatasets = DATASETS.map((d) => d.uncertainty ?? '').join('\n');
  return [fromOpenApi, fromMcp, fromDatasets, PREDICTION_COVERAGE.note, COVERAGE_SUMMARY];
}

describe('coverage attribution', () => {
  it('exposes the served band’s empirical coverage as a sourced measurement, not a bare number', () => {
    // 2026-09-03 — the field went from null (no attributable measurement existed) to a
    // real figure once gate_accumulator started pairing published predictions against
    // genuinely independent +1h observations. It must never appear without its receipts.
    expect(PREDICTION_COVERAGE.nominalPct).toBe(80);
    expect(PREDICTION_COVERAGE.empiricalPicpPct).toBe(77.1);
    expect(PREDICTION_COVERAGE.empiricalN).toBeGreaterThanOrEqual(2000); // b6 accumulation floor
    expect(PREDICTION_COVERAGE.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PREDICTION_COVERAGE.measuredVia).toMatch(/gate_accumulator/);
    expect(PREDICTION_COVERAGE.note).toContain(
      PREDICTION_COVERAGE.empiricalN.toLocaleString('en-US'),
    );
    expect(PREDICTION_COVERAGE.note).toContain(PREDICTION_COVERAGE.measuredAt);
  });

  it('states no unsourced empirical coverage percentage anywhere on the public surface', () => {
    for (const text of prose()) {
      expect(text).not.toMatch(BANNED_COVERAGE_CLAIM);
      expect(text).not.toMatch(BANNED_VERIFIED_LANGUAGE);
      expect(text).not.toMatch(BANNED_STALE_UNMEASURED_CLAIM);
    }
  });

  it('derives the /v1/ontology/summary dataset uncertainty text from the shared constant', () => {
    // 2026-09-03 — DATASETS[city-predictions].uncertainty (served verbatim by
    // handleOntologySummary) hand-retyped "unmeasured" independently of
    // PREDICTION_COVERAGE and drifted stale the same way COVERAGE_SUMMARY once did.
    const cityPredictions = DATASETS.find((d) => d.id === 'city-predictions');
    expect(cityPredictions?.uncertainty).toContain(String(PREDICTION_COVERAGE.empiricalPicpPct));
    expect(cityPredictions?.uncertainty).toContain(
      PREDICTION_COVERAGE.empiricalN.toLocaleString('en-US'),
    );
    expect(cityPredictions?.uncertainty).toContain(PREDICTION_COVERAGE.measuredAt);
  });

  it('derives the OpenAPI and MCP prose from the shared constant, not a retyped copy', () => {
    // Arrange
    const doc = JSON.stringify(buildOpenApi('https://example.test'));
    const mcpText = TOOLS.map((t) => t.description).join('\n');
    // Act / Assert — a hand-written paraphrase would fail here even if it read well.
    expect(doc).toContain(COVERAGE_SUMMARY);
    expect(mcpText).toContain(COVERAGE_SUMMARY);
  });

  it('keeps the qualification — a measured number must not read as "verified"', () => {
    // Glass-box §5: publishing the number must not retract the warning. The aggregate
    // is measured now, but the high bands (n=9, n=67, n=0) are not reliable, and the
    // summary must say so explicitly rather than let a bare percentage imply otherwise.
    expect(COVERAGE_SUMMARY).toMatch(/unmeasured/i);
    expect(COVERAGE_SUMMARY).toMatch(/lower bound/i);
    expect(PREDICTION_COVERAGE.note).toMatch(/remains unmeasured/i);
    expect(PREDICTION_COVERAGE.note).toMatch(/below the 200-pair threshold/i);
    expect(PREDICTION_COVERAGE.note).toMatch(/epistemic-only/i);
  });

  it('states why the 88.2% CV figure is withheld rather than just withholding it', () => {
    // 2026-07-30. "below nominal" used to stand here as the direction of the miss.
    // The CV that now exists points the other way (88.2% vs nominal 80%), so the old
    // wording was a guess this replaces with the actual reason: the deployed artifact
    // is fed 31 of its 106 fitted columns and zero-filled for the rest, which is why
    // a retrained CV cannot speak for this band. Deleting the reason would leave a
    // bare "unmeasured" that reads as if nobody had looked.
    expect(PREDICTION_COVERAGE.note).toMatch(/31 of the 106 feature columns/i);
    expect(PREDICTION_COVERAGE.note).toMatch(/zero/i);
    expect(PREDICTION_COVERAGE.note).not.toMatch(/below nominal/i);
  });

  it('warns that coverage is not uniform in concentration', () => {
    // The measured aggregate (0.890) is not the number a reader needs — above
    // 75 µg/m³ it is 0.506 and above 150 it is 0.000. An aggregate alone would be
    // true on average and wrong exactly where someone would act on it, so both the
    // long note and the one-line summary have to carry the hazard qualifier.
    expect(PREDICTION_COVERAGE.note).toMatch(/0\.506 above 75/);
    expect(PREDICTION_COVERAGE.note).toMatch(/0\.000 above 150/);
    expect(PREDICTION_COVERAGE.note).toMatch(/hazardous concentrations/i);
    expect(COVERAGE_SUMMARY).toMatch(/hazardous concentrations/i);
  });

  it('discloses that the band brackets its own input rather than a forecast', () => {
    // p50 reproduces the observation fed into every lag slot (corr 0.9993, median
    // band 1.00 µg/m³). Without this, a ~100% hit rate against that same observation
    // reads as accuracy. Dropping it would make the narrow band look like confidence.
    expect(PREDICTION_COVERAGE.note).toMatch(/1\.00 µg\/m³/);
    expect(PREDICTION_COVERAGE.note).toMatch(/reproduces the observation/i);
    expect(COVERAGE_SUMMARY).toMatch(/narrow around the observation/i);
  });
});
