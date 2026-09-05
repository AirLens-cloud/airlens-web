/**
 * sparkline.ts — shared "thick line + area fill + endpoint" geometry builder
 * for the compact instrument-rail charts introduced in Wave 2A (Today/Home
 * hero right-rail gauges). Plain single-series only (no p10/p90 band):
 * `CapsulePanel`'s `buildSparkline` and `HomeForecastStrip`'s
 * `buildStripGeometry` already own that richer band shape for their own
 * `CapsuleSeriesPoint[]` data — this is the simpler plain-series case (e.g.
 * hourly temperature) that has no uncertainty bounds to shade.
 *
 * no-fake-data: null/undefined/non-finite entries are skipped, never
 * coerced to 0 — a sparse series draws a shorter line rather than a
 * fabricated dip.
 */
export interface SparklineGeometry {
  linePoints: string
  areaPoints: string
  endX: number
  endY: number
}

export function buildSparkline(
  values: (number | null | undefined)[],
  width: number,
  height: number,
): SparklineGeometry | null {
  const n = values.length
  if (n === 0) return null
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (finite.length === 0) return null
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const span = max - min || 1

  const points: { x: number; y: number }[] = []
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) return
    const x = (i / Math.max(1, n - 1)) * width
    const y = height - ((v - min) / span) * height
    points.push({ x, y })
  })
  if (points.length === 0) return null

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ')
  const areaPoints = [
    `${points[0].x},${height}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${height}`,
  ].join(' ')
  const last = points[points.length - 1]

  return { linePoints, areaPoints, endX: last.x, endY: last.y }
}
