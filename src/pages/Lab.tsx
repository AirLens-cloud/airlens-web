/**
 * Lab — /lab. Local Research Studio skeleton (page-specs/lab-local-research-studio.md
 * §4, Wave B-7).
 *
 * L0 (DuckDB-Wasm/Parquet/Range/CORS feasibility spike) has not passed yet
 * (spec §6, ADR-001 Consequences: "L0 통과 전 쿼리 엔진 기술 확정 금지"), so this
 * page renders the approved anatomy — Left rail (Dataset/Variable/Space/Time/
 * Source/Quality) · Center canvas · Right rail (Query plan/Units·n/Coverage/
 * Warnings/Evidence) · Bottom drawer (Generated SQL/Python/Citation/Export) —
 * entirely inert. Every element here is a plain `<div>`/`<p>` or WfDisabledCta
 * (already used for this exact "Lab is in feasibility review" state on Home's
 * `HomeActOnIt` CTA); nothing has an onClick, onChange, or href. Do not wire
 * real controls or a real query engine here — that is L1's job, not this
 * page's.
 */
import LabRailGroup from '../components/research/LabRailGroup'
import WfDisabledCta from '../components/wireframe/WfDisabledCta'
import '../styles/research.css'

const LEFT_RAIL = [
  { label: 'Dataset', placeholder: 'No dataset selected' },
  { label: 'Variable', placeholder: 'No variable selected' },
  { label: 'Space', placeholder: 'No spatial extent set' },
  { label: 'Time', placeholder: 'No time range set' },
  { label: 'Source', placeholder: 'No source filter set' },
  { label: 'Quality', placeholder: 'No quality filter set' },
]

const RIGHT_RAIL = [
  { label: 'Query plan', placeholder: 'Nothing to run yet' },
  { label: 'Units · n', placeholder: '—' },
  { label: 'Coverage', placeholder: '—' },
  { label: 'Warnings', placeholder: 'No lint results yet' },
  { label: 'Evidence', placeholder: 'Select a mark to inspect it' },
]

export default function Lab() {
  return (
    <main className="lab-page" aria-disabled="true">
      <header className="lab-header">
        <p className="lab-header__badge">FEASIBILITY REVIEW</p>
        <h1 className="lab-header__title h-2">Local Research Studio</h1>
        <p className="lab-header__thesis t-lede">
          Query, chart, and export air-quality data — entirely in your browser, no account, nothing sent to a
          server.
        </p>
      </header>

      <p className="lab-note t-caption" role="note">
        Runs entirely in your browser — nothing leaves your device. In feasibility review: the engine spike
        (DuckDB-Wasm over Parquet ranges) has not passed yet, so every control is inert and says so.
      </p>

      <div className="lab-shell">
        <section className="lab-rail lab-rail--left" aria-label="Filters (inert)">
          {LEFT_RAIL.map((group) => (
            <LabRailGroup key={group.label} label={group.label} placeholder={group.placeholder} />
          ))}
        </section>

        <section className="lab-canvas" aria-label="Canvas (inert)">
          <p className="lab-canvas__placeholder t-caption">
            Canvas — a chart renders here once the engine spike passes.
          </p>
        </section>

        <section className="lab-rail lab-rail--right" aria-label="Query inspector (inert)">
          {RIGHT_RAIL.map((group) => (
            <LabRailGroup key={group.label} label={group.label} placeholder={group.placeholder} />
          ))}
        </section>
      </div>

      <div className="lab-drawer" aria-label="Generated code (inert)">
        <p className="lab-drawer__label t-micro">Generated SQL / Python</p>
        <pre className="lab-drawer__code t-data">-- nothing to generate yet</pre>
        <p className="lab-drawer__label t-micro">Citation</p>
        <p className="lab-drawer__citation t-caption">Nothing to cite yet</p>
        <div className="lab-drawer__actions">
          <WfDisabledCta
            label="Run query"
            note="Feasibility review — engine spike not yet passed."
            testId="lab-cta-run"
          />
          <WfDisabledCta
            label="Export .airlens bundle"
            note="Feasibility review — engine spike not yet passed."
            testId="lab-cta-export"
          />
        </div>
      </div>
    </main>
  )
}
