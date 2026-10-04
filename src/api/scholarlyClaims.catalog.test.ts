import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { METHODOLOGY_CLAIM_IDS } from '../content/methodologySections'
import { MODEL_CARD_CLAIM_IDS } from '../content/legal'
import { parseScholarlyClaims, SCHOLARLY_CLAIMS_URL } from './scholarlyClaims'

describe('checked-in scholarly evidence catalog', () => {
  it('is served at the public contract path and satisfies the runtime boundary', () => {
    const path = resolve(process.cwd(), 'public', SCHOLARLY_CLAIMS_URL.replace(/^\/data\//, 'data/'))
    const document = parseScholarlyClaims(JSON.parse(readFileSync(path, 'utf8')))

    expect(document.claims.length).toBeGreaterThan(0)
  })

  it('contains every claim referenced by methodology and deployed model cards', () => {
    const path = resolve(process.cwd(), 'public/data/evidence/scholarly_claims.v1.json')
    const document = parseScholarlyClaims(JSON.parse(readFileSync(path, 'utf8')))
    const publishedIds = new Set(document.claims.map((claim) => claim.claimId))
    const usedIds = new Set([...METHODOLOGY_CLAIM_IDS, ...MODEL_CARD_CLAIM_IDS])

    expect([...usedIds].filter((id) => !publishedIds.has(id))).toEqual([])
  })
})
