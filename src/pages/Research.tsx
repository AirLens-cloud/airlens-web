/**
 * Research — /research. Research Commons index
 * (page-specs/research-commons-publication-receipt.md §5.1, Wave C-2).
 *
 * The submission → review → publication pipeline (WorkspaceShell approval
 * queue, `/research/submit`) is out of scope — Lab, which produces the
 * `.airlens` bundles a receipt is built from, has not shipped (spec §14).
 * This page therefore renders the only state that is honest today: zero
 * published receipts. No synthetic/example cards fill the grid
 * (EVIDENCE_CONTRACT.md §6-1) — the empty state explains what a receipt is
 * and the fixed anatomy every future receipt will follow (spec §5.2).
 */
import '../styles/research.css'

const RECEIPT_ANATOMY =
  'question → figure → method → supports / does not support → withheld · insufficient n · failed slices → reproduce → citation · immutable'

export default function Research() {
  return (
    <main className="rsc-page">
      <div className="rsc-shell">
        <header className="rsc-header">
          <p className="rsc-header__eyebrow t-micro">RESEARCH COMMONS · REPRODUCIBLE RECEIPTS · 0 PUBLISHED</p>
          <h1 className="rsc-header__title h-2">Research Commons</h1>
          <p className="rsc-header__thesis t-lede">
            A reviewed, reproducible-only publication record of analyses built in the Lab — not a results
            gallery.
          </p>
        </header>

        <section className="rsc-empty" data-testid="rsc-empty">
          <p className="rsc-empty__title t-body">No receipts published yet.</p>
          <p className="rsc-empty__body t-caption">
            A receipt is a published analysis an operator has independently reproduced from its{' '}
            <code>.airlens</code> bundle — the question it asked, what it found, what it does not support, and
            the exact command to reproduce it. Nothing here is a gallery of results; every entry is checked
            before it appears.
          </p>
          <p className="rsc-empty__cta t-caption">
            Publishing requires the <a href="/lab">Lab</a>, which is still in feasibility review.
          </p>
        </section>

        <section className="rsc-anatomy" aria-label="Receipt structure">
          <p className="rsc-anatomy__label t-micro">Receipt anatomy</p>
          <p className="rsc-anatomy__chain t-data">{RECEIPT_ANATOMY}</p>
        </section>
      </div>
    </main>
  )
}
