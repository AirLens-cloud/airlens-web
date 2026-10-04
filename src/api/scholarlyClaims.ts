import type {
  ScholarlyClaimDomain,
  ScholarlyClaim,
  ScholarlyClaimsDocument,
  ScholarlyClaimStatus,
  ScholarlyReference,
} from '../types/evidence'

export const SCHOLARLY_CLAIMS_URL = '/data/evidence/scholarly_claims.v1.json'

const STATUSES = new Set<ScholarlyClaimStatus>([
  'supported',
  'mixed',
  'contradicted',
  'insufficient',
  'withdrawn',
])
const DOMAINS = new Set<ScholarlyClaimDomain>([
  'purpose',
  'method',
  'performance',
  'causal',
  'health',
  'coverage',
  'license',
  'positioning',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasLocalizedText(value: unknown): value is { ko: string; en: string } {
  return isRecord(value) && typeof value.ko === 'string' && typeof value.en === 'string'
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_TIME.test(value) && Number.isFinite(Date.parse(value))
}

function isReference(value: unknown): value is ScholarlyReference {
  if (!isRecord(value)) return false
  // Reference URLs are rendered as hrefs: only https:// may cross the boundary.
  if (value.idType === 'url' && !(typeof value.id === 'string' && value.id.startsWith('https://'))) return false
  return (
    ['doi', 'arxiv', 'guideline', 'url'].includes(String(value.idType)) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    ['primary', 'supporting', 'contrasting', 'authority'].includes(String(value.role)) &&
    ['none', 'correction', 'expression-of-concern', 'retraction'].includes(String(value.notice))
  )
}

function isClaim(value: unknown): value is ScholarlyClaim {
  if (!isRecord(value) || value.schemaVersion !== '1.0') return false
  if (!hasLocalizedText(value.statement) || !isRecord(value.limitations)) return false
  return (
    typeof value.claimId === 'string' &&
    DOMAINS.has(value.domain as ScholarlyClaimDomain) &&
    (value.risk === 'high' || value.risk === 'standard') &&
    STATUSES.has(value.status as ScholarlyClaimStatus) &&
    isIsoDate(value.verifiedAt) &&
    Array.isArray(value.references) &&
    value.references.every(isReference) &&
    Array.isArray(value.airlensEvidenceRefs) &&
    value.airlensEvidenceRefs.every((item) => typeof item === 'string') &&
    Array.isArray(value.limitations.ko) &&
    value.limitations.ko.every((item) => typeof item === 'string') &&
    Array.isArray(value.limitations.en) &&
    value.limitations.en.every((item) => typeof item === 'string')
  )
}

export function parseScholarlyClaims(value: unknown): ScholarlyClaimsDocument {
  if (
    !isRecord(value) ||
    value.schema_version !== 'scholarly_claims.v1' ||
    typeof value.generated_at !== 'string' ||
    !Array.isArray(value.claims) ||
    !value.claims.every(isClaim)
  ) {
    throw new Error('Scholarly evidence payload does not satisfy scholarly_claims.v1')
  }

  const ids = value.claims.map((claim) => claim.claimId)
  if (new Set(ids).size !== ids.length) {
    throw new Error('Scholarly evidence payload contains duplicate claim IDs')
  }
  return value as unknown as ScholarlyClaimsDocument
}

export async function fetchScholarlyClaims(signal?: AbortSignal): Promise<ScholarlyClaimsDocument> {
  const response = await fetch(SCHOLARLY_CLAIMS_URL, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error(`Scholarly evidence request failed (${response.status})`)
  return parseScholarlyClaims(await response.json())
}
