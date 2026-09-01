import { useMemo, useState } from 'react'
import '../styles/static.css'
import { matchLegacyRedirect } from '../content/legacyRedirects'
import { FAQ_ITEMS } from '../content/faq'
import { GLOSSARY_TERMS } from '../content/glossaryTerms'
import { METHODOLOGY_SECTIONS } from '../content/methodologySections'

/**
 * NotFound — catch-all `*`. A recovery surface, not a joke page
 * (page-specs/about-faq-notfound.md §6): search, a Data health link, a
 * legacy-route explanation/redirect when the path matches one of 5 retired
 * routes, and — the one place EVIDENCE_CONTRACT's cursor round-trip applies
 * to a 404 — an "Open on Globe" link that carries forward any
 * `?cursor=…`/`?lat=…&lon=…` the visitor arrived with, so a broken or
 * renamed link never drops the scene they were trying to reach.
 */

const CURSOR_PARAM_KEYS = ['cursor', 'lat', 'lon', 't']

interface SearchIndexEntry {
  title: string
  href: string
  source: string
}

function buildSearchIndex(): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = []
  for (const item of FAQ_ITEMS) entries.push({ title: item.question, href: '/faq', source: 'FAQ' })
  for (const term of GLOSSARY_TERMS) entries.push({ title: term.term, href: `/glossary#${term.termId}`, source: 'Glossary' })
  for (const section of METHODOLOGY_SECTIONS) {
    entries.push({ title: section.title, href: `/methodology#${section.sectionId}`, source: 'Methodology' })
  }
  entries.push({ title: 'Trust Center', href: '/trust', source: 'Page' })
  entries.push({ title: 'About', href: '/about', source: 'Page' })
  entries.push({ title: 'Data Sources', href: '/data-sources', source: 'Page' })
  return entries
}

const SEARCH_INDEX = buildSearchIndex()

export interface NotFoundProps {
  /** Injectable for tests; defaults to the real browser location when omitted. */
  pathname?: string
  search?: string
}

export default function NotFound({ pathname, search }: NotFoundProps = {}) {
  const requestedPath = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  const requestedSearch = search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return SEARCH_INDEX.filter((entry) => entry.title.toLowerCase().includes(q)).slice(0, 8)
  }, [query])

  const legacy = matchLegacyRedirect(requestedPath)

  const cursorHref = useMemo(() => {
    const params = new URLSearchParams(requestedSearch)
    const hasCursor = CURSOR_PARAM_KEYS.some((key) => params.has(key))
    if (!hasCursor) return null
    return `/globe${requestedSearch}`
  }, [requestedSearch])

  return (
    <main className="static-page" data-tier="text">
      <header className="static-page__header">
        <h1 className="h-hero">This page can’t be found</h1>
        <p className="static-page__thesis t-lede">
          You requested <code className="notfound__path">{requestedPath}</code>.
        </p>
      </header>

      <section className="notfound__section" aria-label="Search">
        <h2 className="h-3">Search</h2>
        <div className="notfound__search">
          <label htmlFor="notfound-search" className="a11y-only">Search pages, terms, and sources</label>
          <input
            id="notfound-search"
            type="search"
            placeholder="Search FAQ, Glossary, Methodology…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {query.trim() ? (
          results.length > 0 ? (
            <ul className="notfound__search-results">
              {results.map((r) => (
                <li key={`${r.source}-${r.href}-${r.title}`}>
                  <a href={r.href}>{r.title} <span className="t-micro" style={{ color: 'var(--ink-3)' }}>· {r.source}</span></a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-caption" style={{ color: 'var(--ink-2)' }}>No matches.</p>
          )
        ) : null}
      </section>

      <section className="notfound__section" aria-label="Data health">
        <h2 className="h-3">Data health</h2>
        <p className="t-body">
          Check whether AirLens’s data feeds are currently responding.
        </p>
        <a href="/probe">Open Data health (temporary diagnostic page) →</a>
      </section>

      {legacy ? (
        <section className="notfound__section" aria-label="Legacy route">
          <h2 className="h-3">About this old link</h2>
          <table className="notfound__legacy-table">
            <thead>
              <tr>
                <th scope="col">Old path</th>
                <th scope="col">What happened</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>{legacy.path}</code></td>
                <td>
                  {legacy.reason}
                  {legacy.kind === 'redirect' && legacy.target ? (
                    <>
                      {' '}
                      <a href={legacy.target}>Go to {legacy.target} →</a>
                    </>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      {cursorHref ? (
        <section className="notfound__section" aria-label="Restore scene">
          <h2 className="h-3">Restore your scene</h2>
          <p className="t-body">
            This link included a scene reference. You can open the same scene on the Globe instead.
          </p>
          <a className="notfound__cursor-cta" href={cursorHref}>Open on Globe ↗</a>
        </section>
      ) : null}
    </main>
  )
}
