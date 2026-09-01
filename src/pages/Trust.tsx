import type { CSSProperties } from 'react'
import '../styles/static.css'
import { LEGAL_DOCS } from '../content/legal'

/**
 * Trust — `/trust`. A discovery hub, not a merge of the pages it points to
 * (page-specs/trust-center-and-legal.md §1 "합병이 아니라 안내 허브"). This
 * page renders no EvidenceEnvelope values of its own — no AQI numbers, no
 * source counts, no dataset counts — it only routes to the pages that do.
 * That constraint is load-bearing enough to be pinned by Trust.test.tsx.
 */

const SECTIONS = [
  {
    key: 'sources',
    title: '① Sources',
    summary: 'Where every reading comes from — status, license, coverage, and cadence, read from the publishing registry.',
    href: '/data-sources',
    cta: 'View Data Sources →',
  },
  {
    key: 'datasets',
    title: '② Datasets',
    summary: 'The published data products behind the site, with what each one covers and when it last shipped.',
    href: '/datasets',
    cta: 'View Datasets →',
  },
  {
    key: 'methods',
    title: '③ Methods',
    summary: 'How AirLens turns raw signal into what you see — data nature, AQI conversion, uncertainty, and their limits.',
    href: '/methodology',
    cta: 'View Methodology →',
  },
  {
    key: 'models',
    title: '④ Model cards',
    summary: 'Regulatory-style disclosure for every model actually deployed on this site — no models under research, nothing planned.',
    href: '/legal/model-card',
    cta: 'View Model Card →',
  },
  {
    key: 'health',
    title: '⑤ Health',
    summary: 'A live check of whether AirLens’s data feeds are responding. This currently runs on a temporary diagnostic page — not the final Data Health UI.',
    href: '/probe',
    cta: 'Open Data health (temporary) →',
  },
  {
    key: 'legal',
    title: '⑥ Legal',
    summary: 'Privacy, Terms, AI Disclaimer, AUP, Data Contribution, and the Model Card — every document below is a draft under review.',
    href: '/legal/privacy',
    cta: 'Browse legal documents →',
  },
] as const

export default function Trust() {
  return (
    <main className="static-page" data-tier="hub">
      <header className="static-page__header fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>
        <h1 className="h-hero">Trust Center</h1>
        <p className="static-page__thesis t-lede">
          No values are rendered here — only where to verify them. Each card below routes to the page that
          actually holds the evidence, model provenance, or legal commitment you’re looking for.
        </p>
      </header>

      <section className="trust-grid fluid-enter" style={{ '--enter-i': 1 } as CSSProperties} aria-label="Trust Center sections">
        {SECTIONS.map((section) => (
          <a key={section.key} className="trust-card wf-card wf-card--lift" href={section.href}>
            <h2 className="trust-card__title h-3">{section.title}</h2>
            <p className="trust-card__summary t-body">{section.summary}</p>
            <span className="trust-card__note t-micro">{section.cta}</span>
          </a>
        ))}
      </section>

      <section aria-label="Legal document index" className="fluid-enter" style={{ '--enter-i': 2 } as CSSProperties}>
        <h2 className="h-3">Legal documents</h2>
        <p className="t-caption" style={{ color: 'var(--ink-2)' }}>
          Trust Center does not replace the legal index — each document below is its own page.
        </p>
        <nav className="trust-legal-index" aria-label="Legal documents">
          {LEGAL_DOCS.map((doc) => (
            <a key={doc.id} href={`/legal/${doc.id}`}>
              <span>{doc.title}</span>
              <span className="t-micro" style={{ color: 'var(--ink-3)' }}>V0.1 DRAFT</span>
            </a>
          ))}
        </nav>
      </section>
    </main>
  )
}
