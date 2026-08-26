/**
 * DawnReport — the "FIELD REPORT" letterhead that prints in as the paper
 * settles. Ported from AirLens-platform apps/web/src/components/home/observatory/DawnReport.tsx
 * with react-i18next stripped — plain-English string literals in place of
 * `t()` calls (this component had no other dependency).
 *
 * Every line is data the visitor just flew over (nothing fabricated): grid
 * size, the actual peak cell, the FIRMS count, and the forecast with its own
 * error bars. The parent scroll handler toggles the `.on` class on each
 * `[data-th]` line (scroll-scrubbed printing) — simplified in this port to a
 * static reveal (no scroll-scrubbing wiring), per the porting brief.
 */
export interface DawnReportProps {
  gridCells: number
  /** hottest real cell — coordinate label, never a made-up region name */
  peak: { ug: number; label: string } | null
  firesTotal: number
  forecast: { city: string; p50: number; p10: number | null; p90: number | null; dqss: string } | null
}

export default function DawnReport({ gridCells, peak, firesTotal, forecast }: DawnReportProps) {
  return (
    <div className="dawn-report">
      <div className="dr-ghost" data-th="0.50">
        Field<br />Report
      </div>
      <div className="dr-rule" data-th="0.56" />
      <div className="dr-line m num" data-th="0.62">
        &gt; <span className="v">{gridCells.toLocaleString('en-US')}</span> grid cells scanned · 1.0° · GEFS-Aerosols
      </div>
      <div className="dr-line m num" data-th="0.70">
        &gt; peak cell <span className="v">{peak ? `${Math.round(peak.ug)} µG/M³` : '—'}</span>
        {peak ? ` · ${peak.label}` : ''}
      </div>
      <div className="dr-line m num" data-th="0.78">
        &gt; FIRMS <span className="v">{firesTotal}</span>{' '}
        {firesTotal === 0
          ? 'detections — quiet pass, nothing fabricated'
          : 'active detections plotted, FRP-weighted'}
      </div>
      <div className="dr-line m num" data-th="0.86">
        {forecast ? (
          <>
            &gt; {forecast.city} 48H P50 <span className="v">{forecast.p50.toFixed(1)}</span>
            {forecast.p10 != null && forecast.p90 != null ? (
              <>
                {' '}· P10–P90 <span className="v">{forecast.p10.toFixed(1)} – {forecast.p90.toFixed(1)}</span>
              </>
            ) : (
              <> · deterministic — no band</>
            )}
            {' '}· DQSS <span className="v">{forecast.dqss}</span>
          </>
        ) : (
          <>&gt; forecast unavailable this pass — we say so instead of inventing one</>
        )}
      </div>
    </div>
  )
}
