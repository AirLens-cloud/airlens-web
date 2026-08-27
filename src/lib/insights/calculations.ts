/**
 * Pure, display-agnostic helpers for the Insights policy/SDID surface.
 * Ported from AirLens-platform `apps/web/src/lib/insights/calculations.ts`;
 * `formatP` moved to `./format` so every readout formatter lives in one place.
 */
import type { CountryPanel, SdidPoint } from '../../types/policy'

/**
 * The one country-year observation behind the map's hover readout, or `null`
 * when that year has no observation.
 *
 * `null` is load-bearing: the panel skips missing years rather than
 * interpolating, so the map genuinely shows a gap there. Callers must render
 * the absence rather than substituting 0 or the nearest year — a tooltip that
 * quietly filled the hole would assert a measurement nobody took.
 */
export function findPanelObservation(
  panels: CountryPanel[],
  countryCode: string,
  year: number,
): number | null {
  const cc = countryCode.toUpperCase()
  const panel = panels.find((p) => p.countryCode.toUpperCase() === cc)
  const point = panel?.points.find((p) => p.year === year)
  return point && Number.isFinite(point.pm25) ? point.pm25 : null
}

/** Mean observed PM2.5 over the years matching `pred` (real data, no fabrication). */
export function meanObserved(
  series: SdidPoint[] | undefined,
  pred: (year: number) => boolean,
): number | null {
  if (!series || series.length === 0) return null
  const vals = series.filter((p) => pred(p.year)).map((p) => p.observed)
  if (vals.length === 0) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}
