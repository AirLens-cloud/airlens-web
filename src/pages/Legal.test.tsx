// All 6 legal documents must carry the "V0.1 DRAFT · UNDER REVIEW" badge —
// none has been reviewed by counsel yet (page-specs/trust-center-and-legal.md
// §4, §6, §10 acceptance test 3). This also pins the Model Card's §5 Rule 1
// (only actually-deployed models listed) and the en/ko equal-force notice.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import Legal from './Legal'
import { LEGAL_DOCS, DEPLOYED_MODELS, type LegalDocId } from '../content/legal'

afterEach(cleanup)

describe('Legal — draft badge', () => {
  for (const doc of LEGAL_DOCS) {
    it(`shows the draft badge on ${doc.id}`, () => {
      render(<Legal doc={doc.id} />)
      expect(screen.getByText(/V0\.1 DRAFT/)).not.toBeNull()
      expect(screen.getByText(/UNDER REVIEW/)).not.toBeNull()
    })
  }

  it('shows the Korean-pending notice honestly rather than a placeholder', () => {
    render(<Legal doc="privacy" />)
    expect(screen.getByText(/Korean version pending/i)).not.toBeNull()
  })
})

describe('Legal — Model Card', () => {
  it('lists only actually-deployed models, none from the App-only surface', () => {
    render(<Legal doc="model-card" />)
    for (const model of DEPLOYED_MODELS) {
      expect(screen.getByText(model.name)).not.toBeNull()
    }
    expect(screen.queryByText(/camera ai/i)).toBeNull()
    expect(screen.queryByText(/moodcast/i)).toBeNull()
    expect(screen.queryByText(/rag chat/i)).toBeNull()
  })

  it('marks unfinalized fields as TBD, never blank or a made-up number', () => {
    render(<Legal doc="model-card" />)
    expect(screen.getAllByText(/TBD — next update/i).length).toBeGreaterThan(0)
  })
})

describe('Legal — navigation', () => {
  it('marks the current document aria-current in the sidebar nav', () => {
    const doc: LegalDocId = 'terms'
    render(<Legal doc={doc} />)
    const current = screen.getByRole('link', { current: 'page' })
    expect(current.textContent).toMatch(/Terms/)
  })
})
