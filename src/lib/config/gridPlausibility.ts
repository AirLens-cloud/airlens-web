/**
 * Whether a published PM2.5 grid reading is one this app can report on.
 *
 * The live artifact (`aq-data/current-pm25-grid.json`, NOAA GEFS-Aerosols)
 * ships cells far past anything our scale covers. Measured 2026-09-04 on the
 * published file: p50 4.97, p99 52.48, p99.9 401.46, and a maximum of
 * 15,867.96 µg/m³ — 25 cells above 1,000, in two contiguous patches over the
 * Yakutia fire belt. GRID is Today's preferred source, so before this check
 * such a cell won the headline outright and told the reader their local air
 * was hazardous at 15,868 µg/m³.
 *
 * The test applied here is deliberately about *us*, not about the atmosphere:
 * our conversions are defined over a bounded scale, and past the top of it
 * `pm25ToAqi` returns a flat 500 while `gradeFromPm25` returns its worst
 * grade — so 15,868 and 501 reach the UI indistinguishable. That collapse was
 * already happening, silently, with no way for a reader to know a number had
 * left the range the scale can describe. Naming it is most of what this does.
 *
 * What it deliberately does NOT do is judge the reading's physical realism.
 * A first attempt drew that line at 999.9 µg/m³, reusing the bound in
 * `models/configs/model_params.yaml`, and justified it by calling each cell a
 * 1° × 1° mean. Review killed both halves. The producer's `subsample()`
 * (`airlens-data` `scripts/etl/collect_noaa_aq.py`) is exact-match
 * decimation, not averaging — it keeps the native ~0.25° GEFS points that
 * land on integer degrees — so a cell is a model point value, not an average
 * over 1° of anything. And 999.9 was derived for excluding OpenAQ station
 * sentinels (a 10,000.0 marker, against Korean urban readings): bending one
 * repo's station bound onto another's NWP output is the shape of mistake this
 * project already has a name for. Deciding where model output stops being
 * physical needs archive statistics or a citation, and neither is in hand, so
 * this file claims only what it can prove.
 *
 * Values are never rewritten here. Consumers render the real number and,
 * beside it, the reason it is not driving a verdict.
 */
import { EPA_PM25_BREAKPOINTS } from './aqi';

export type Pm25Verdict = 'reportable' | 'beyond-scale';

export interface Pm25Plausibility {
  verdict: Pm25Verdict;
  /** Reader-facing reason, empty when reportable. It says the value cannot be
   * verified rather than that it is wrong — from the browser, a decoding
   * glitch, a model overshoot, and a genuine extreme plume look the same. */
  reason: string;
}

/**
 * Top of the scale this app is defined over: the upper PM2.5 bound of the
 * last row of `EPA_PM25_BREAKPOINTS`. Derived by reference rather than typed
 * in, so revising that table carries this with it instead of leaving the two
 * to drift; `gridPlausibility.test.ts` pins the derivation.
 *
 * Note whose scale this is. That table is the pre-2024 EPA breakpoint set the
 * repo keeps for decoding WAQI values (see its comment there) — the display
 * bands elsewhere do follow the 2024 revision. So this bound means "the top
 * of the range our conversions cover", which is the claim being made, and not
 * a statement about the current EPA standard.
 */
export const REPORTABLE_MAX_UGM3 = EPA_PM25_BREAKPOINTS[EPA_PM25_BREAKPOINTS.length - 1][3];

const BEYOND_SCALE_REASON = 'beyond the top of our reporting scale — we cannot verify this reading';

const REPORTABLE: Pm25Plausibility = { verdict: 'reportable', reason: '' };
const BEYOND_SCALE: Pm25Plausibility = { verdict: 'beyond-scale', reason: BEYOND_SCALE_REASON };

/**
 * A non-finite reading is broken, not small — classify it explicitly rather
 * than letting `NaN > x` evaluate false and carry it through as reportable.
 */
export function classifyPm25(pm25: number): Pm25Plausibility {
  if (!Number.isFinite(pm25)) return BEYOND_SCALE;
  return pm25 > REPORTABLE_MAX_UGM3 ? BEYOND_SCALE : REPORTABLE;
}

/** True when a reading is inside the scale, and so may back a verdict. */
export function isReportable(plausibility: Pm25Plausibility | undefined): boolean {
  return plausibility === undefined || plausibility.verdict === 'reportable';
}
