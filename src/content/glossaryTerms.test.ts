/**
 * glossaryTerms.ts — data-integrity coverage (AAA).
 *
 * The ontology's `relations` array (O1, aq-ontology-feasibility-2026-09-02.md
 * §3) is only useful as a graph if every edge actually resolves — a dangling
 * `target` would render a broken related-term chip on `/glossary`
 * (`relatedTermIds` → `findGlossaryTerm` returns `undefined`, and the UI
 * falls back to printing the raw termId string). This test is the guard
 * against that drifting silently as the catalog grows.
 *
 * `methodRef` is the second edge type — a term pointing at the
 * `/methodology` section that explains it. It is checked against the real
 * section catalog, not against a string shape: a kebab-case check passes a
 * ref that names no section at all, which is exactly how four dangling refs
 * survived (page-specs/methodology-glossary-knowledge-system.md §13 test 3
 * asks for "dangling link 0건").
 */
import { describe, it, expect } from 'vitest'
import { GLOSSARY_TERMS, findGlossaryTerm, relatedTermIds } from './glossaryTerms'
import { METHODOLOGY_SECTIONS } from './methodologySections'

describe('GLOSSARY_TERMS data integrity', () => {
  it('has no duplicate termIds', () => {
    const ids = GLOSSARY_TERMS.map((t) => t.termId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every relation target resolves to a real termId', () => {
    const knownIds = new Set(GLOSSARY_TERMS.map((t) => t.termId))
    const dangling: string[] = []
    for (const term of GLOSSARY_TERMS) {
      for (const rel of term.relations) {
        if (!knownIds.has(rel.target)) {
          dangling.push(`${term.termId} --${rel.type}--> ${rel.target}`)
        }
      }
    }
    expect(dangling).toEqual([])
  })

  it('no term relates to itself', () => {
    const selfRefs = GLOSSARY_TERMS.filter((t) => t.relations.some((r) => r.target === t.termId)).map(
      (t) => t.termId,
    )
    expect(selfRefs).toEqual([])
  })

  it('relatedTermIds derives from relations and stays deduplicated', () => {
    const dqss = findGlossaryTerm('dqss')
    expect(dqss).toBeDefined()
    const ids = relatedTermIds(dqss!)
    expect(ids.length).toBe(new Set(ids).size)
    expect(ids).toContain('dqss-grade')
  })

  it('every methodRef resolves to a real MethodologySection', () => {
    const knownSections = new Set(METHODOLOGY_SECTIONS.map((s) => s.sectionId))
    const dangling: string[] = []
    for (const term of GLOSSARY_TERMS) {
      if (term.methodRef !== undefined && !knownSections.has(term.methodRef)) {
        dangling.push(`${term.termId} --methodRef--> ${term.methodRef}`)
      }
    }
    expect(dangling).toEqual([])
  })
})
