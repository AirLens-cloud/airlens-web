// About must never read as marketing copy — the "three products + two
// infra" narrative and the roadmap state table both carry zero account,
// subscription, or payment language (page-specs/about-faq-notfound.md §4,
// §9 acceptance test 2). This pins that as a regression, and pins the
// verifiable-state-table drift guard (§4.1 "last verified" column exists on
// every row).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import About from './About'
import { ROADMAP_STATE } from '../content/aboutState'

afterEach(cleanup)

// Same rationale as Faq.test.tsx: "account" and "payment" are not forbidden
// in the abstract — the Operating Principles say "No accounts." and "no
// payments" outright, on purpose (that's the substance of the claim). What
// must never appear is the *mechanics* of an actual account/billing system:
// signing in, registering, a password, a subscription, or a billing/card
// flow — none of which exist on this site.
const FORBIDDEN = /\b(log ?in|sign ?up|password|subscription|billing|credit card|checkout)\b/i

describe('About', () => {
  it('renders zero account/subscription/payment keywords', () => {
    const { container } = render(<About />)
    expect(container.textContent).not.toMatch(FORBIDDEN)
  })

  it('renders a "last verified" date for every roadmap stage row (D8 drift guard)', () => {
    const { container } = render(<About />)
    for (const row of ROADMAP_STATE) {
      expect(container.textContent).toContain(row.lastVerified)
    }
  })

  it('renders the three products and two infrastructures tables', () => {
    const { getAllByRole } = render(<About />)
    const tables = getAllByRole('table')
    expect(tables.length).toBeGreaterThanOrEqual(3)
  })
})
