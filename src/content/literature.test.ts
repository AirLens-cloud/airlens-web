import { describe, it, expect } from 'vitest'
import {
  CALIBRATION_METHODS,
  LITERATURE_DOMAINS,
  LITERATURE_REFS,
  citeLabel,
  literatureChunks,
  refUrl,
} from './literature'

const chunks = literatureChunks()

describe('literature ledger', () => {
  it('gives every reference a resolvable identifier', () => {
    // The ledger's inclusion rule is "arXiv ID 또는 DOI가 API로 확인된 문헌만
    // 포함" — an entry with neither would produce a citation card whose link
    // goes nowhere, which is worse than no card.
    // Arrange / Act
    const unresolvable = LITERATURE_REFS.filter((r) => !r.doi && !r.arxivId).map((r) => r.refId)
    // Assert
    expect(unresolvable, `refs with no DOI and no arXiv id: ${unresolvable.join(', ')}`).toEqual([])
  })

  it('has no duplicate keys or method slugs', () => {
    // Arrange / Act
    const refIds = LITERATURE_REFS.map((r) => r.refId)
    const slugs = CALIBRATION_METHODS.map((m) => m.slug)
    // Assert
    expect(new Set(refIds).size).toBe(refIds.length)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe('literatureChunks', () => {
  it('keeps every chunk id inside Vectorize\'s 64-byte cap, in ASCII', () => {
    // Vector ids cap at 64 bytes and a Korean character costs 3 — a slug built
    // from the Korean method label silently blows the cap at index time, which
    // is why the keys are hand-assigned ASCII.
    // Arrange / Act
    const tooLong = chunks.filter((c) => new TextEncoder().encode(c.id).length > 64).map((c) => c.id)
    const nonAscii = chunks.filter((c) => !/^[A-Za-z0-9:._-]+$/.test(c.id)).map((c) => c.id)
    // Assert
    expect(tooLong, `ids over 64 bytes: ${tooLong.join(', ')}`).toEqual([])
    expect(nonAscii, `non-ASCII ids: ${nonAscii.join(', ')}`).toEqual([])
  })

  it('emits unique ids that do not collide with the five first-party sources', () => {
    // matchRoute-style first-hit semantics do not apply here, but a duplicate
    // id means one chunk silently overwrites the other at upsert time.
    // Arrange / Act
    const ids = chunks.map((c) => c.id)
    const firstPartyPrefixes = ['methodology:', 'faq:', 'glossary:', 'about:', 'legal:']
    // Assert
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => firstPartyPrefixes.some((p) => id.startsWith(p)))).toEqual([])
  })

  it('labels every chunk as literature so the prompt can tell it from first-party docs', () => {
    // buildGroundedContext (workers/assistant/src/rag.ts) keys its
    // "this is external work, not AirLens documentation" wording off category.
    // Arrange / Act / Assert
    expect(chunks.every((c) => c.category === 'literature')).toBe(true)
  })

  it('states the not-AirLens-measurement scope on every card except the caveat card', () => {
    // The caveat card is itself about the reading list's limits, so it does not
    // need the per-card scope line; every other card is a claim and does.
    // Arrange / Act
    const missing = chunks
      .filter((c) => c.id !== 'literature:caveat')
      .filter((c) => !c.text.includes('AirLens가 측정한 값이 아니다'))
      .map((c) => c.id)
    // Assert
    expect(missing, `cards missing the scope note: ${missing.join(', ')}`).toEqual([])
  })

  it('emits a card only for papers that report a figure of their own', () => {
    // A "title + doi" card with no claim in it grounds nothing and still costs
    // one of the five retrieval slots.
    // Arrange
    const withNumbers = LITERATURE_REFS.filter((r) => r.quantitativeClaim)
    // Act
    const paperCards = chunks.filter(
      (c) => c.id.startsWith('literature:') && LITERATURE_REFS.some((r) => c.id === `literature:${r.refId}`),
    )
    // Assert
    expect(paperCards).toHaveLength(withNumbers.length)
    expect(paperCards.every((c) => c.source_url.startsWith('https://'))).toBe(true)
  })

  it('counts each domain\'s references from the ledger rather than from a typed-in number', () => {
    // The domain cards assert "식별자가 확인된 문헌 N편". If that N were hand
    // written it would drift the moment the ledger changes, and the assistant
    // would cite a fabricated count.
    for (const domain of LITERATURE_DOMAINS) {
      // Arrange
      const expected = LITERATURE_REFS.filter((r) => r.domains.includes(domain.id)).length
      // Act
      const card = chunks.find((c) => c.id === `literature:domain-${domain.id}`)
      // Assert
      expect(card, `no card for domain ${domain.id}`).toBeDefined()
      expect(card!.text).toContain(`문헌 ${expected}편`)
    }
  })

  it('carries each domain\'s caveat, not just its favorable half', () => {
    // A positioning summary that keeps only the good news is marketing.
    for (const domain of LITERATURE_DOMAINS) {
      const card = chunks.find((c) => c.id === `literature:domain-${domain.id}`)
      expect(card!.text).toContain(domain.caveat)
    }
  })

  it('does not read the un-retrieved citation landscape as "no rebuttals"', () => {
    // The prior session downgraded its own "contrasting = 0" to undecidable;
    // the corpus must say so rather than let the model infer consensus.
    // Arrange / Act
    const caveat = chunks.find((c) => c.id === 'literature:caveat')
    // Assert
    expect(caveat).toBeDefined()
    expect(caveat!.text).toContain('반박이 없다')
    expect(caveat!.text).toContain('판정 불가')
  })

  it('names the two subject gaps instead of leaving them silently uncovered', () => {
    // Health dose-response and national AQI scales are the two axes ordinary
    // visitors actually ask about, and neither has sourced evidence yet.
    const caveat = chunks.find((c) => c.id === 'literature:caveat')!
    expect(caveat.text).toContain('건강영향 용량-반응')
    expect(caveat.text).toContain('AQI')
  })
})

describe('refUrl / citeLabel', () => {
  it('prefers a DOI link and falls back to the arXiv abstract page', () => {
    // Arrange / Act / Assert
    expect(
      refUrl({ refId: 'k', title: 't', authors: [], year: 2020, arxivId: '1234.5678', doi: '10.1/x', role: '', domains: [], quantitativeClaim: null }),
    ).toBe('https://doi.org/10.1/x')
    expect(
      refUrl({ refId: 'k', title: 't', authors: [], year: 2020, arxivId: '1234.5678', doi: null, role: '', domains: [], quantitativeClaim: null }),
    ).toBe('https://arxiv.org/abs/1234.5678')
  })

  it('throws rather than emit a card whose link goes nowhere', () => {
    // Arrange / Act / Assert
    expect(() =>
      refUrl({ refId: 'orphan', title: 't', authors: [], year: null, arxivId: null, doi: null, role: '', domains: [], quantitativeClaim: null }),
    ).toThrow(/orphan/)
  })

  it('formats one, two, and three-plus authors without inventing initials', () => {
    const make = (authors: string[]) => ({ refId: 'k', title: 't', authors, year: 2019, arxivId: '1', doi: null, role: '', domains: [], quantitativeClaim: null })
    // Arrange / Act / Assert
    expect(citeLabel(make(['Yaniv Romano']))).toBe('Romano, 2019')
    expect(citeLabel(make(['Tianqi Chen', 'Carlos Guestrin']))).toBe('Chen & Guestrin, 2019')
    expect(citeLabel(make(['Yaniv Romano', 'Evan Patterson', 'Emmanuel J. Candès']))).toBe('Romano et al., 2019')
  })
})
