import { useEffect, useMemo, useState } from 'react'
import { fetchScholarlyClaims } from '../../api/scholarlyClaims'
import type { ScholarlyClaim, ScholarlyReference } from '../../types/evidence'
import '../../styles/evidence.css'

type EvidenceLocale = 'en' | 'ko'

interface ScholarlyEvidencePanelProps {
  claimIds?: readonly string[]
}

const COPY = {
  en: {
    title: 'Scholarly evidence',
    intro: 'AirLens review decisions, stable paper identifiers, and the limits that travel with each claim.',
    language: 'Evidence language',
    loading: 'Loading evidence…',
    unavailable: 'Evidence is temporarily unavailable.',
    missing: 'A referenced claim is missing from the published catalog.',
    verified: 'Reviewed',
    limitations: 'Limitations',
    references: 'References',
    airlens: 'AirLens evaluation artifacts',
    status: {
      supported: 'Supported',
      mixed: 'Mixed',
      contradicted: 'Contradicted',
      insufficient: 'Insufficient evidence',
      withdrawn: 'Withdrawn',
    },
    role: {
      primary: 'Primary',
      supporting: 'Supporting',
      contrasting: 'Contrasting',
      authority: 'Authority',
    },
    notice: {
      correction: 'Correction',
      'expression-of-concern': 'Expression of concern',
      retraction: 'Retraction',
    },
  },
  ko: {
    title: '학술 근거',
    intro: '각 주장에 대한 AirLens 판정, 안정적인 논문 식별자, 함께 공개해야 하는 한계입니다.',
    language: '근거 언어',
    loading: '근거를 불러오는 중…',
    unavailable: '현재 근거를 불러올 수 없습니다.',
    missing: '참조된 주장이 공개 카탈로그에 없습니다.',
    verified: '검토일',
    limitations: '한계',
    references: '참고문헌',
    airlens: 'AirLens 평가 아티팩트',
    status: {
      supported: '지지됨',
      mixed: '혼재',
      contradicted: '반박됨',
      insufficient: '근거 부족',
      withdrawn: '철회',
    },
    role: {
      primary: '1차 근거',
      supporting: '지지 근거',
      contrasting: '대조 근거',
      authority: '권위 지침',
    },
    notice: {
      correction: '정정',
      'expression-of-concern': '우려 표명',
      retraction: '철회',
    },
  },
} as const

function referenceHref(reference: ScholarlyReference): string | null {
  if (reference.idType === 'doi') return `https://doi.org/${reference.id}`
  if (reference.idType === 'arxiv') return `https://arxiv.org/abs/${reference.id}`
  if (reference.idType === 'url') return reference.id
  return null
}

function artifactHref(path: string): string {
  return `https://github.com/AirLens-cloud/AirLens/blob/main/${path.split('/').map(encodeURIComponent).join('/')}`
}

function ClaimCard({ claim, locale }: { claim: ScholarlyClaim; locale: EvidenceLocale }) {
  const copy = COPY[locale]
  const reviewed = new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(claim.verifiedAt))

  return (
    <article id={`claim-${claim.claimId}`} className="scholarly-claim" data-status={claim.status}>
      <header className="scholarly-claim__header">
        <span className="scholarly-claim__status t-tag">{copy.status[claim.status]}</span>
        <span className="scholarly-claim__date t-micro">{copy.verified}: {reviewed}</span>
      </header>
      <p className="scholarly-claim__statement t-body" lang={locale}>{claim.statement[locale]}</p>

      <h3 className="scholarly-claim__label t-micro">{copy.references}</h3>
      <ul className="scholarly-claim__references">
        {claim.references.map((reference) => {
          const href = referenceHref(reference)
          return (
            <li key={`${reference.idType}:${reference.id}`}>
              <span className="t-tag">{copy.role[reference.role]}</span>{' '}
              {href ? (
                <a href={href} target="_blank" rel="noreferrer">{reference.title} ↗</a>
              ) : (
                <span>{reference.title}</span>
              )}{' '}
              <code>{reference.idType === 'arxiv' ? `arXiv:${reference.id}` : reference.id}</code>
              {reference.notice !== 'none' ? (
                <strong className="scholarly-claim__notice" role="alert">
                  {copy.notice[reference.notice]}
                </strong>
              ) : null}
            </li>
          )
        })}
      </ul>

      {claim.airlensEvidenceRefs.length > 0 ? (
        <>
          <h3 className="scholarly-claim__label t-micro">{copy.airlens}</h3>
          <ul className="scholarly-claim__artifacts">
            {claim.airlensEvidenceRefs.map((path) => (
              <li key={path}><a href={artifactHref(path)} target="_blank" rel="noreferrer"><code>{path}</code> ↗</a></li>
            ))}
          </ul>
        </>
      ) : null}

      <h3 className="scholarly-claim__label t-micro">{copy.limitations}</h3>
      <ul className="scholarly-claim__limitations" lang={locale}>
        {claim.limitations[locale].map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </article>
  )
}

export default function ScholarlyEvidencePanel({ claimIds }: ScholarlyEvidencePanelProps) {
  const [locale, setLocale] = useState<EvidenceLocale>('en')
  const [claims, setClaims] = useState<ScholarlyClaim[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void fetchScholarlyClaims(controller.signal)
      .then((document) => setClaims(document.claims))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true)
      })
    return () => controller.abort()
  }, [])

  const selected = useMemo(() => {
    if (!claims) return null
    if (!claimIds) return claims
    const byId = new Map(claims.map((claim) => [claim.claimId, claim]))
    return claimIds.map((id) => byId.get(id)).filter((claim): claim is ScholarlyClaim => Boolean(claim))
  }, [claimIds, claims])
  const missingClaim = Boolean(claims && claimIds && selected && selected.length !== claimIds.length)
  const copy = COPY[locale]

  useEffect(() => {
    if (!selected || !window.location.hash) return
    // Claim IDs are lower kebab-case, so no URI decoding is needed. Reading the
    // raw fragment also keeps a malformed external URL from throwing here.
    const targetId = window.location.hash.slice(1)
    if (targetId !== 'scholarly-evidence' && !targetId.startsWith('claim-')) return
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: 'start' })
    })
  }, [selected])

  return (
    <section id="scholarly-evidence" className="scholarly-evidence" aria-labelledby="scholarly-evidence-title">
      <div className="scholarly-evidence__heading">
        <div>
          <h2 id="scholarly-evidence-title" className="h-3">{copy.title}</h2>
          <p className="t-caption">{copy.intro}</p>
        </div>
        <div className="scholarly-evidence__locale" role="group" aria-label={copy.language}>
          <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>English</button>
          <button type="button" aria-pressed={locale === 'ko'} onClick={() => setLocale('ko')}>한국어</button>
        </div>
      </div>

      {!claims && !error ? <p role="status" className="t-caption">{copy.loading}</p> : null}
      {error ? <p role="alert" className="scholarly-evidence__error t-caption">{copy.unavailable}</p> : null}
      {missingClaim ? <p role="alert" className="scholarly-evidence__error t-caption">{copy.missing}</p> : null}
      {selected?.map((claim) => <ClaimCard key={claim.claimId} claim={claim} locale={locale} />)}
    </section>
  )
}
