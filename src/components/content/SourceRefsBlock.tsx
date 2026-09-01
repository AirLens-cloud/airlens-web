import type { BlogSourceRef } from '../../types/blog'
import WfStamp from '../wireframe/WfStamp'

export interface SourceRefsBlockProps {
  refs: BlogSourceRef[]
}

/**
 * "Sources reviewed" block — `blog-field-notes.md` §4.2, the Glass-box
 * transparency mechanism this surface owns instead of an "AirLens summary"
 * stamp (§1: Blog is first-party editorial, not a summarized third-party
 * article). `type='news'` opens the internal `/news/:slug` article,
 * `type='data'` opens the external URL in a new tab. No DataQuality/DQSS
 * badge here — that belongs to whichever page the link lands on, never to
 * this list (§6-3).
 */
export default function SourceRefsBlock({ refs }: SourceRefsBlockProps) {
  if (refs.length === 0) return null
  return (
    <section className="content-sources" aria-label="Sources reviewed">
      <WfStamp label="◆ Sources reviewed" />
      <ul className="content-sources__list">
        {refs.map((ref, i) => (
          <li key={`${ref.type}-${ref.ref}-${i}`} className="content-sources__item t-caption">
            {ref.type === 'news' ? (
              <a href={`/news/${ref.ref}`}>{ref.label}</a>
            ) : (
              <a href={ref.ref} target="_blank" rel="noopener noreferrer">
                {ref.label}
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="content-sources__caveat t-caveat">
        First-party data reference — the linked page carries its own quality signal, this list does not restate one.
      </p>
    </section>
  )
}
