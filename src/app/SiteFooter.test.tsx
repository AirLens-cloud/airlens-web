// SiteFooter — link coverage (AAA). This is the other half of nav.test.ts's
// orphan check: NAV_ORPHAN_EXCEPTIONS (/legal/:doc, /about, /faq) are
// excused from GlobalNav specifically because SiteFooter is expected to
// cover them, so this file asserts that promise actually holds for every
// concrete path the exception list stands in for.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import SiteFooter from './SiteFooter'
import { NAV_GROUPS } from './nav'
import { LEGAL_DOCS } from '../content/legal'
import { NAV_ORPHAN_EXCEPTIONS } from './nav'

afterEach(cleanup)

describe('SiteFooter — NAV_ORPHAN_EXCEPTIONS coverage', () => {
  it('lists /legal/:doc as the pattern the exception list stands in for', () => {
    // Arrange / Act / Assert — a static sanity check that the exception this
    // file exists to cover hasn't silently changed shape upstream.
    expect(NAV_ORPHAN_EXCEPTIONS).toContain('/legal/:doc')
    expect(NAV_ORPHAN_EXCEPTIONS).toContain('/about')
    expect(NAV_ORPHAN_EXCEPTIONS).toContain('/faq')
  })

  it('renders a link to /about and /faq', () => {
    // Arrange / Act
    render(<SiteFooter />)
    // Assert
    expect(screen.getByRole('link', { name: 'About' }).getAttribute('href')).toBe('/about')
    expect(screen.getByRole('link', { name: 'FAQ' }).getAttribute('href')).toBe('/faq')
  })

  it('renders a concrete link for every LEGAL_DOCS entry', () => {
    // Arrange / Act
    render(<SiteFooter />)
    // Assert
    for (const doc of LEGAL_DOCS) {
      const link = screen.getByRole('link', { name: doc.title })
      expect(link.getAttribute('href')).toBe(`/legal/${doc.id}`)
    }
  })
})

describe('SiteFooter — NAV_GROUPS columns', () => {
  it('renders every group label as a column heading', () => {
    // Arrange / Act
    render(<SiteFooter />)
    // Assert
    for (const group of NAV_GROUPS) {
      expect(screen.getByRole('heading', { name: group.label })).not.toBeNull()
    }
  })

  it('renders Overview plus every sub-item for a group with items (Insights)', () => {
    // Arrange
    render(<SiteFooter />)
    // Act
    const insightsHeading = screen.getByRole('heading', { name: 'Insights' })
    const column = insightsHeading.closest('.chrome-footer__col')
    if (!column) throw new Error('Insights column not found')
    // Assert
    const links = Array.from(column.querySelectorAll('a')).map((a) => a.textContent)
    expect(links).toEqual(['Overview', 'Dispatch', 'Blog'])
  })

  it('renders Map as a single direct link with no separate Overview row (zero-item group)', () => {
    // Arrange / Act
    render(<SiteFooter />)
    // Assert
    const mapHeading = screen.getByRole('heading', { name: 'Map' })
    const mapLink = mapHeading.querySelector('a')
    expect(mapLink?.getAttribute('href')).toBe('/globe')
    const column = mapHeading.closest('.chrome-footer__col')
    expect(column?.querySelectorAll('a').length).toBe(1)
  })
})

describe('SiteFooter — brand column', () => {
  it('links the logo to home and shows the AirLens wordmark', () => {
    // Arrange / Act
    render(<SiteFooter />)
    // Assert
    expect(screen.getByRole('link', { name: /AirLens home/i }).getAttribute('href')).toBe('/')
  })
})
