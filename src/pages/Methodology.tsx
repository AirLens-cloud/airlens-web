import type { CSSProperties } from 'react'
import '../styles/static.css'
import { METHODOLOGY_SECTIONS } from '../content/methodologySections'
import { GLOSSARY_TERMS } from '../content/glossaryTerms'

/**
 * Methodology — `/methodology`. The method library: one section per method,
 * each fixed to "what / why / limitations" — limitations are never omitted
 * (Glass-box: a methods page that only lists advantages is marketing copy).
 * Each section links to a real scene (Globe/Weather/Insights) where that
 * method is actually visible, and to its related Glossary terms.
 */
export default function Methodology() {
  return (
    <main className="static-page" data-tier="hub">
      <header className="static-page__header fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>
        <h1 className="h-hero">Methodology</h1>
        <p className="static-page__thesis t-lede">
          How AirLens turns raw signal into what you see on screen — one section per method, each with what it
          is, why AirLens uses it, and where it should not be trusted.
        </p>
      </header>

      <div className="methodology-layout fluid-enter" style={{ '--enter-i': 1 } as CSSProperties}>
        <nav aria-label="Methodology sections">
          <ol className="methodology-toc">
            {METHODOLOGY_SECTIONS.map((s) => (
              <li key={s.sectionId}>
                <a href={`#${s.sectionId}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div>
          {METHODOLOGY_SECTIONS.map((section) => (
            <section
              key={section.sectionId}
              id={section.sectionId}
              className="methodology-section"
              aria-labelledby={`${section.sectionId}-title`}
            >
              <h2 id={`${section.sectionId}-title`} className="h-3">{section.title}</h2>

              <div className="methodology-section__field">
                <span className="methodology-section__field-label t-tag">What</span>
                <p className="t-body">{section.what}</p>
              </div>
              <div className="methodology-section__field">
                <span className="methodology-section__field-label t-tag">Why</span>
                <p className="t-body">{section.why}</p>
              </div>
              <div className="methodology-section__field">
                <span className="methodology-section__field-label t-tag">Limitations</span>
                <p className="t-body methodology-section__limitations">{section.limitations}</p>
              </div>

              {section.exampleHref ? (
                <div className="methodology-section__example">
                  <span className="t-caption">See this method’s output in practice.</span>
                  <a href={section.exampleHref} target="_blank" rel="noreferrer">
                    {section.exampleLabel ?? 'Open this ↗'}
                  </a>
                </div>
              ) : null}

              {section.relatedTermIds.length > 0 ? (
                <div className="methodology-section__related">
                  {section.relatedTermIds.map((termId) => {
                    const term = GLOSSARY_TERMS.find((t) => t.termId === termId)
                    if (!term) return null
                    return (
                      <a key={termId} href={`/glossary#${termId}`} className="t-tag">{term.term}</a>
                    )
                  })}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
