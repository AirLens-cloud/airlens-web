import { describe, expect, it } from 'vitest'
import { parseScholarlyClaims } from './scholarlyClaims'

function documentFixture() {
  return {
    schema_version: 'scholarly_claims.v1',
    generated_at: '2026-09-06T00:00:00Z',
    claims: [
      {
        schemaVersion: '1.0',
        claimId: 'fixture-claim',
        domain: 'method',
        risk: 'standard',
        status: 'supported',
        verifiedAt: '2026-09-05T00:00:00Z',
        statement: { en: 'English statement', ko: '한국어 문장' },
        references: [
          {
            idType: 'doi',
            id: '10.1000/example',
            title: 'Reference title',
            role: 'primary',
            notice: 'none',
          },
        ],
        airlensEvidenceRefs: ['models/eval/report.json'],
        limitations: { en: ['English limit'], ko: ['한국어 한계'] },
      },
    ],
  }
}

describe('parseScholarlyClaims', () => {
  it('accepts the public producer contract', () => {
    expect(parseScholarlyClaims(documentFixture()).claims[0].claimId).toBe('fixture-claim')
  })

  it('rejects malformed and duplicate claim records', () => {
    const malformed = documentFixture()
    malformed.claims[0].statement = { en: 'English only' } as { en: string; ko: string }
    expect(() => parseScholarlyClaims(malformed)).toThrow(/does not satisfy/)

    const duplicate = documentFixture()
    duplicate.claims.push(structuredClone(duplicate.claims[0]))
    expect(() => parseScholarlyClaims(duplicate)).toThrow(/duplicate claim IDs/)
  })

  it('accepts https URL references and rejects other URL schemes', () => {
    const ok = documentFixture()
    ok.claims[0].references[0] = { ...ok.claims[0].references[0], idType: 'url', id: 'https://example.org/paper' }
    expect(parseScholarlyClaims(ok).claims[0].references[0].id).toBe('https://example.org/paper')

    for (const id of ['http://example.org/paper', 'javascript:alert(1)', 'data:text/html,x', '//example.org']) {
      const bad = documentFixture()
      bad.claims[0].references[0] = { ...bad.claims[0].references[0], idType: 'url', id }
      expect(() => parseScholarlyClaims(bad)).toThrow(/does not satisfy/)
    }
  })

  it('requires ISO-formatted verification dates', () => {
    for (const verifiedAt of ['2026-09-05', '2026-09-05T00:00:00Z', '2026-09-05T09:00:00+09:00']) {
      const ok = documentFixture()
      ok.claims[0].verifiedAt = verifiedAt
      expect(parseScholarlyClaims(ok).claims[0].verifiedAt).toBe(verifiedAt)
    }
    for (const verifiedAt of ['Sept 5 2026', '2026/09/05', '2026-13-45', '5']) {
      const bad = documentFixture()
      bad.claims[0].verifiedAt = verifiedAt
      expect(() => parseScholarlyClaims(bad)).toThrow(/does not satisfy/)
    }
  })
})
