import { useMemo, useState } from 'react'
import '../styles/static.css'
import { GLOSSARY_TERMS, type GlossaryCategory } from '../content/glossaryTerms'

/**
 * Glossary — `/glossary`. A concept graph, not a static dictionary: every
 * card links to its method (`methodRef`) and related terms
 * (page-specs/methodology-glossary-knowledge-system.md §4.2). Search and
 * category filtering are client-side only — this is static content, no
 * server round-trip.
 */

const CATEGORY_LABEL: Record<GlossaryCategory, string> = {
  nature: 'Nature',
  quality: 'Quality',
  method: 'Method',
  ui: 'UI',
}
const CATEGORIES: GlossaryCategory[] = ['nature', 'quality', 'method', 'ui']

export default function Glossary() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<GlossaryCategory | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GLOSSARY_TERMS.filter((term) => {
      const matchesCategory = category === 'all' || term.natureTag === category
      const matchesQuery = !q || term.term.toLowerCase().includes(q) || term.definition.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [query, category])

  return (
    <main className="static-page" data-tier="hub">
      <header className="static-page__header">
        <h1 className="h-hero">Glossary</h1>
        <p className="static-page__thesis t-lede">
          What each term on AirLens actually means — every entry links to the method that produces it and the
          concepts it relates to.
        </p>
      </header>

      <div className="glossary-controls">
        <div>
          <label htmlFor="glossary-search" className="a11y-only">Search terms</label>
          <input
            id="glossary-search"
            type="search"
            placeholder="Search terms…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="seg" role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`seg-item${category === 'all' ? ' active' : ''}`}
            aria-pressed={category === 'all'}
            onClick={() => setCategory('all')}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`seg-item${category === c ? ' active' : ''}`}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glossary-empty">
          <p className="t-body">No terms match.</p>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setQuery('')
              setCategory('all')
            }}
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="glossary-grid">
          {filtered.map((term) => {
            const expanded = expandedId === term.termId
            return (
              <article key={term.termId} id={term.termId} className="glossary-card wf-card">
                <button
                  type="button"
                  className="glossary-card__trigger"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : term.termId)}
                >
                  <h2 className="glossary-card__term h-3">{term.term}</h2>
                  <p className="glossary-card__def t-caption">{term.definition}</p>
                </button>
                {expanded ? (
                  <div className="glossary-card__expanded">
                    <p className="t-micro" style={{ color: 'var(--ink-2)' }}>{term.example}</p>
                    {term.methodRef ? (
                      <a href={`/methodology#${term.methodRef}`}>See method →</a>
                    ) : null}
                    <div className="glossary-card__related">
                      {term.relatedTerms.map((relId) => (
                        <a key={relId} href={`#${relId}`} className="t-tag">{relId}</a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
