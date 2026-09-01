/**
 * LabRailGroup — one inert filter/inspector category in the `/lab` skeleton.
 *
 * Plain `<div>`/`<p>` markup, no interactive elements and no handlers — the
 * whole Local Research Studio shell is inert by construction while the L0
 * engine spike (DuckDB-Wasm over Parquet ranges, ADR-001 Consequences) has
 * not passed. See page-specs/lab-local-research-studio.md §6.
 */
export interface LabRailGroupProps {
  label: string
  placeholder: string
}

export default function LabRailGroup({ label, placeholder }: LabRailGroupProps) {
  return (
    <div className="lab-rail-group" aria-disabled="true">
      <p className="lab-rail-group__label t-micro">{label}</p>
      <p className="lab-rail-group__placeholder t-caption">{placeholder}</p>
    </div>
  )
}
