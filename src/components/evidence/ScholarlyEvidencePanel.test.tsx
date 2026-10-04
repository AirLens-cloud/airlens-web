import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ScholarlyEvidencePanel from './ScholarlyEvidencePanel'

const statuses = ['supported', 'mixed', 'contradicted', 'insufficient', 'withdrawn'] as const

function fixture() {
  return {
    schema_version: 'scholarly_claims.v1',
    generated_at: '2026-09-06T00:00:00Z',
    claims: statuses.map((status, index) => ({
      schemaVersion: '1.0',
      claimId: `${status}-fixture`,
      domain: 'method',
      risk: index > 1 ? 'high' : 'standard',
      status,
      verifiedAt: '2026-09-05T00:00:00Z',
      statement: { en: `${status} English statement`, ko: `${status} 한국어 문장` },
      references: [
        {
          idType: index % 2 === 0 ? 'doi' : 'arxiv',
          id: index % 2 === 0 ? `10.1000/${status}` : `1905.0322${index}`,
          title: `${status} reference`,
          role: index === 1 ? 'contrasting' : 'primary',
          notice: status === 'withdrawn' ? 'retraction' : status === 'mixed' ? 'correction' : 'none',
        },
      ],
      airlensEvidenceRefs: [`models/eval/${status}.json`],
      limitations: { en: [`${status} English limit`], ko: [`${status} 한국어 한계`] },
    })),
  }
}

function mockCatalog(value = fixture()) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => value }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', window.location.pathname)
})

describe('ScholarlyEvidencePanel', () => {
  it('renders every decision status, DOI/arXiv links, roles, artifacts, and notices', async () => {
    mockCatalog()
    const { container } = render(<ScholarlyEvidencePanel />)

    await screen.findByText('supported English statement')
    for (const status of statuses) {
      expect(container.querySelector(`[data-status="${status}"]`)).not.toBeNull()
    }
    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href')?.startsWith('https://doi.org/'))).toBe(true)
    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href')?.startsWith('https://arxiv.org/abs/'))).toBe(true)
    expect(screen.getByText('Contrasting')).not.toBeNull()
    expect(screen.getByText('Correction')).not.toBeNull()
    expect(screen.getByText('Retraction')).not.toBeNull()
    expect(screen.getAllByText(/models\/eval\//).length).toBeGreaterThan(0)
  })

  it('renders scientific meaning from the same record in Korean and English', async () => {
    mockCatalog()
    render(<ScholarlyEvidencePanel claimIds={['mixed-fixture']} />)
    await screen.findByText('mixed English statement')

    const koreanButton = screen.getByRole('button', { name: '한국어' })
    fireEvent.click(koreanButton)

    expect(koreanButton.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('mixed 한국어 문장').getAttribute('lang')).toBe('ko')
    expect(screen.getByText('혼재')).not.toBeNull()
    expect(screen.getByText('mixed 한국어 한계')).not.toBeNull()
  })

  it('fails visibly when a page references a missing claim', async () => {
    mockCatalog()
    render(<ScholarlyEvidencePanel claimIds={['not-in-catalog']} />)

    expect((await screen.findByRole('alert')).textContent).toMatch(/referenced claim is missing/i)
  })

  it('shows a public-safe error when the static artifact cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    render(<ScholarlyEvidencePanel />)

    expect((await screen.findByRole('alert')).textContent).toMatch(/temporarily unavailable/i)
  })

  it('restores a scholarly claim deep link after the catalog loads', async () => {
    mockCatalog()
    const scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    window.history.replaceState(null, '', '#claim-mixed-fixture')

    render(<ScholarlyEvidencePanel />)
    await screen.findByText('mixed English statement')

    await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' }))
  })
})
