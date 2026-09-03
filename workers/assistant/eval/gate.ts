// eval/gate.ts — baseline regression gate (ported from the retired chatbot
// worker's eval/gate.ts, itself an airlens_care eval/gate.py port).
//
// Contract: an eval metric must never regress more than MARGIN below its
// committed baseline. Baselines are updated by a HUMAN after reviewing a
// better run — never automatically (silent baseline drift would make the
// gate vacuous). A `null` baseline means the metric has not had its first
// measured run yet; the gate is skipped and the test only reports the value.
import baseline from './baseline.json';

export const MARGIN = 0.1;

export type MetricName = keyof typeof baseline;

/**
 * Minimum acceptable value for a metric, or null when no baseline exists yet.
 */
export function gateFloor(metric: MetricName): number | null {
  const value = baseline[metric];
  if (value === null || typeof value !== 'number') return null;
  return value - MARGIN;
}

/**
 * Assert a measured value against the baseline gate. Skips (with a report
 * line) when the baseline is not yet measured.
 */
export function checkGate(metric: MetricName, measured: number): void {
  const floor = gateFloor(metric);
  if (floor === null) {
    console.log(`[eval-gate] ${metric}=${measured.toFixed(3)} (no baseline yet — gate skipped; commit a baseline after human review)`);
    return;
  }
  console.log(`[eval-gate] ${metric}=${measured.toFixed(3)} floor=${floor.toFixed(3)} baseline=${String(baseline[metric])}`);
  if (measured < floor) {
    throw new Error(
      `[eval-gate] ${metric} regressed: measured ${measured.toFixed(3)} < floor ${floor.toFixed(3)} ` +
        `(baseline ${String(baseline[metric])} − MARGIN ${MARGIN}). ` +
        'If this regression is intentional, a human must update eval/baseline.json.',
    );
  }
}
