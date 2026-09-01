// NotFound must not drop the scene a visitor was trying to reach — the one
// place EVIDENCE_CONTRACT's cursor round-trip applies to a 404
// (page-specs/about-faq-notfound.md §6.1 ④, §9 acceptance test 6-7).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import NotFound from './NotFound'

afterEach(cleanup)

describe('NotFound — cursor preservation', () => {
  it('carries a ?cursor=… param forward into the "Open on Globe" link', () => {
    render(<NotFound pathname="/some/renamed-route" search="?cursor=abc123" />)
    const cta = screen.getByRole('link', { name: /open on globe/i })
    expect(cta.getAttribute('href')).toBe('/globe?cursor=abc123')
  })

  it('carries lat/lon params forward the same way', () => {
    render(<NotFound pathname="/old-path" search="?lat=37.5&lon=126.9" />)
    const cta = screen.getByRole('link', { name: /open on globe/i })
    expect(cta.getAttribute('href')).toBe('/globe?lat=37.5&lon=126.9')
  })

  it('shows no "Open on Globe" CTA when there is no cursor-shaped param', () => {
    render(<NotFound pathname="/typo-page" search="" />)
    expect(screen.queryByRole('link', { name: /open on globe/i })).toBeNull()
  })
})

describe('NotFound — legacy routes', () => {
  it('shows the matching row and an honest no-accounts explanation for /profile', () => {
    render(<NotFound pathname="/profile" search="" />)
    expect(screen.getByText(/no accounts/i)).not.toBeNull()
  })

  it('shows a real redirect link for /insights/transparency', () => {
    render(<NotFound pathname="/insights/transparency" search="" />)
    const link = screen.getByRole('link', { name: /go to \/methodology/i })
    expect(link.getAttribute('href')).toBe('/methodology')
  })

  it('renders no legacy-route section for an arbitrary unmatched path', () => {
    render(<NotFound pathname="/totally-made-up" search="" />)
    expect(screen.queryByText(/about this old link/i)).toBeNull()
  })
})
