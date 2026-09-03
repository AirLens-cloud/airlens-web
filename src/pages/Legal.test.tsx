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
  })

  it('lists the Field Assistant now that the chat worker is live on this site', () => {
    // Regression the other way: this card used to assert the chat was ABSENT,
    // which stayed green after SiteChrome started mounting ChatWidget on every
    // page — a passing test pinning a claim that had become false.
    render(<Legal doc="model-card" />)
    expect(screen.getByText(/Field Assistant/i)).not.toBeNull()
  })

  it('marks unfinalized fields as TBD, never blank or a made-up number', () => {
    render(<Legal doc="model-card" />)
    expect(screen.getAllByText(/TBD — next update/i).length).toBeGreaterThan(0)
  })
})

describe('Legal — Privacy states what the chat actually does', () => {
  // The chat sends what a visitor types off their device; the policy has to
  // say so on the page, not only in a design doc. These pin the three claims
  // that would otherwise drift back out of sync with the worker.
  it('discloses that chat messages are sent to Cloudflare Workers AI', () => {
    render(<Legal doc="privacy" />)
    expect(screen.getByText(/Cloudflare Workers AI/i)).not.toBeNull()
  })

  it('states that turns are kept, what is masked first, and for how long', () => {
    // Replaces the earlier "nothing is kept" assertion, which became false
    // the moment the worker gained a storage path. The policy has to describe
    // the storage BEFORE the flag that enables it is switched on, so this
    // test is the thing that fails if the two ever drift apart again.
    render(<Legal doc="privacy" />)
    expect(screen.getByText(/keeps a copy of those exchanges/i)).not.toBeNull()
    expect(screen.getByText(/Masking happens in the same request, before anything is written/i)).not.toBeNull()
    expect(screen.getByText(/destroyed after 90 days/i)).not.toBeNull()
  })

  it('admits it cannot delete one specific conversation on request', () => {
    // The uncomfortable half. With no account there is no way to verify a
    // conversation is yours — saying so is the honest version of "we respect
    // your rights"; omitting it would let the reader assume a flow exists.
    render(<Legal doc="privacy" />)
    expect(screen.getByText(/cannot honour a request to delete a specific one/i)).not.toBeNull()
  })

  it('discloses the daily-rotating IP-derived abuse counter', () => {
    // Shipped with the per-caller quota key (workers/assistant session.ts
    // resolveIdentifier) — undisclosed, it would contradict the "no account
    // identifier" sentence two paragraphs above it.
    render(<Legal doc="privacy" />)
    expect(screen.getByText(/derived from your IP address/i)).not.toBeNull()
    expect(screen.getByText(/rotates daily/i)).not.toBeNull()
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
