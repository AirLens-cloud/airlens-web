export type ScholarlyClaimDomain =
  | 'purpose'
  | 'method'
  | 'performance'
  | 'causal'
  | 'health'
  | 'coverage'
  | 'license'
  | 'positioning'

export type ScholarlyClaimStatus =
  | 'supported'
  | 'mixed'
  | 'contradicted'
  | 'insufficient'
  | 'withdrawn'

export interface ScholarlyReference {
  idType: 'doi' | 'arxiv' | 'guideline' | 'url'
  id: string
  title: string
  role: 'primary' | 'supporting' | 'contrasting' | 'authority'
  notice: 'none' | 'correction' | 'expression-of-concern' | 'retraction'
}

export interface ScholarlyClaim {
  schemaVersion: '1.0'
  claimId: string
  domain: ScholarlyClaimDomain
  risk: 'high' | 'standard'
  status: ScholarlyClaimStatus
  verifiedAt: string
  statement: { ko: string; en: string }
  references: ScholarlyReference[]
  airlensEvidenceRefs: string[]
  limitations: { ko: string[]; en: string[] }
}

export interface ScholarlyClaimsDocument {
  schema_version: 'scholarly_claims.v1'
  generated_at: string
  claims: ScholarlyClaim[]
}

/** Immutable Research Commons receipt linkage; claim definitions stay in the catalog. */
export interface PublicationReceiptEvidence {
  scholarlyClaimIds: string[]
  dataSnapshot: string
  codeSha: string
  whatThisSupports: { ko: string[]; en: string[] }
  whatThisDoesNotSupport: { ko: string[]; en: string[] }
  withheldResults: { ko: string[]; en: string[] }
  sampleLimitations: { ko: string[]; en: string[] }
  failedSlices: { ko: string[]; en: string[] }
}
