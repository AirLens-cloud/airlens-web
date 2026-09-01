import '../styles/static.css'
import { LEGAL_DOCS, KOREAN_PENDING_NOTICE, DEPLOYED_MODELS, type LegalDocId } from '../content/legal'

export interface LegalProps {
  doc: LegalDocId
}

/**
 * Legal — `/legal/*`, 6 documents fanned out by the `doc` prop
 * (page-specs/trust-center-and-legal.md §4). Every document carries a
 * permanent "V0.1 DRAFT · UNDER REVIEW" badge — none of these six has been
 * reviewed by counsel yet, and this page never implies otherwise
 * (Legal.test.tsx pins the badge on all 6). Model Card additionally lists
 * only models actually deployed on this site (§5 Rule 1).
 */
export default function Legal({ doc }: LegalProps) {
  const current = LEGAL_DOCS.find((d) => d.id === doc) ?? LEGAL_DOCS[0]

  return (
    <main className="static-page" data-tier="hub">
      <a className="static-page__back t-caption" href="/trust">← Trust Center</a>

      <div className="legal-layout">
        <nav className="legal-nav" aria-label="Legal documents">
          <ol className="legal-nav__list">
            {[...LEGAL_DOCS].sort((a, b) => a.order - b.order).map((d) => (
              <li key={d.id}>
                <a
                  className="legal-nav__link"
                  href={`/legal/${d.id}`}
                  aria-current={d.id === current.id ? 'page' : undefined}
                >
                  {String(d.order).padStart(2, '0')} · {d.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="legal-doc" aria-labelledby="legal-doc-title">
          <div className="legal-draft-badge" role="status">
            <span className="legal-draft-badge__dot" aria-hidden="true" />
            <span>V0.1 DRAFT · UNDER REVIEW</span>
          </div>

          <h1 id="legal-doc-title" className="h-hero">{current.title}</h1>
          <p className="legal-doc__summary t-lede">{current.summary}</p>
          <p className="legal-doc__updated t-micro">Last updated: {current.lastUpdated}</p>

          <div className="legal-doc__body">
            {current.body.map((paragraph, i) => (
              <p key={i} className="t-body">{paragraph}</p>
            ))}
          </div>

          {current.id === 'model-card' ? (
            <table className="legal-model-table">
              <caption>Models actually deployed on airlens-web — no research-only or planned models.</caption>
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Used at</th>
                  <th scope="col">Nature</th>
                  <th scope="col">HF technical card</th>
                  <th scope="col">Last published</th>
                </tr>
              </thead>
              <tbody>
                {DEPLOYED_MODELS.map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td><a href={m.usedAt.href}>{m.usedAt.label}</a></td>
                    <td>{m.nature}</td>
                    <td>
                      {m.hfCardUrl ? (
                        <a href={m.hfCardUrl} target="_blank" rel="noreferrer">Open on Hugging Face ↗</a>
                      ) : (
                        <span className="legal-model-table__tbd">TBD — next update</span>
                      )}
                    </td>
                    <td>
                      {m.lastPublished ?? <span className="legal-model-table__tbd">TBD — next update</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <p className="legal-doc__body t-body">
            This document’s English and Korean versions carry equal force. Whenever one is revised, the other
            must be revised at the same time — see the notice below for the current status of the Korean version.
          </p>

          <div className="legal-doc__lang-notice t-caption">{KOREAN_PENDING_NOTICE}</div>
        </article>
      </div>
    </main>
  )
}
