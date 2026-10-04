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
})
