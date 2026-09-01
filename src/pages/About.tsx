import type { CSSProperties } from 'react'
import PublicPageContainer from '../components/wireframe/PublicPageContainer'
import '../styles/static.css'
import { ROADMAP_STATE, THREE_PRODUCTS, TWO_INFRA, OPERATING_PRINCIPLES, type RoadmapStageStatus } from '../content/aboutState'

/**
 * About — `/about`. Answers "what is AirLens, and what actually works right
 * now" with a verifiable state table rather than marketing copy
 * (page-specs/about-faq-notfound.md §4). The state table is hand-maintained
 * (D8) — the "last verified" column exists so a stale row is visible instead
 * of silently drifting from reality (§4.1). The Operating Principles say "no
 * accounts" and "no payments" outright (that's the point — §2 "비협상
 * 원칙"), but no *transactional* account/payment mechanics language (sign-up,
 * login, password, subscription, billing) appears anywhere (About.test.tsx
 * pins that).
 */

const STATUS_LABEL: Record<RoadmapStageStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  done: 'Done',
}

export default function About() {
  return (
    <PublicPageContainer tier="text" className="static-page">
      <header className="static-page__header fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>
        <h1 className="h-hero">About AirLens</h1>
        <p className="static-page__thesis t-lede">
          AirLens is not a site that shows you air conditions — it is an accountless Atmospheric Evidence
          Observatory that lets you keep promoting a scene you selected on screen into evidence, a query, an
          analysis, and a publication.
        </p>
      </header>

      <section aria-label="Three products" className="fluid-enter" style={{ '--enter-i': 1 } as CSSProperties}>
        <h2 className="h-3">Three products</h2>
        <div className="about-table-wrap">
          <table className="about-table">
            <caption>What each product does</caption>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Surface</th>
                <th scope="col">In one line</th>
              </tr>
            </thead>
            <tbody>
              {THREE_PRODUCTS.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.surface}</td>
                  <td>{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Two infrastructures" className="fluid-enter" style={{ '--enter-i': 2 } as CSSProperties}>
        <h2 className="h-3">Two infrastructures</h2>
        <div className="about-table-wrap">
          <table className="about-table">
            <caption>Who produces, who consumes</caption>
            <thead>
              <tr>
                <th scope="col">Infrastructure</th>
                <th scope="col">Role</th>
              </tr>
            </thead>
            <tbody>
              {TWO_INFRA.map((i) => (
                <tr key={i.name}>
                  <td>{i.name}</td>
                  <td>{i.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Operating principles" className="fluid-enter" style={{ '--enter-i': 3 } as CSSProperties}>
        <h2 className="h-3">Operating principles</h2>
        <ul className="about-principles t-body">
          {OPERATING_PRINCIPLES.map((principle) => (
            <li key={principle}>{principle}</li>
          ))}
        </ul>
      </section>

      <section aria-label="Verifiable current state" className="fluid-enter" style={{ '--enter-i': 4 } as CSSProperties}>
        <h2 className="h-3">Where things actually stand</h2>
        <p className="t-caption" style={{ color: 'var(--ink-2)' }}>
          Each row is filled in by a person cross-checking the code and docs, not generated automatically — the
          "last verified" date exists so a stale row is visible rather than hidden.
        </p>
        <div className="about-table-wrap">
          <table className="about-table">
            <caption>Roadmap stage status (manually maintained)</caption>
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Outcome</th>
                <th scope="col">Status</th>
                <th scope="col">Last verified</th>
              </tr>
            </thead>
            <tbody>
              {ROADMAP_STATE.map((row) => (
                <tr key={row.stage}>
                  <td>{row.stage}</td>
                  <td>{row.outcome}</td>
                  <td className={`about-status--${row.status}`}>
                    {STATUS_LABEL[row.status]} — {row.statusNote}
                  </td>
                  <td>{row.lastVerified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PublicPageContainer>
  )
}
