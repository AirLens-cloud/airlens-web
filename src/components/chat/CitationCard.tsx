import { OpenIcon } from '../icons'
import type { ChatCitation } from '../../types/chat'

/**
 * CitationCard — ported from AirLens-platform apps/web/src/components/chat/CitationCard.tsx
 * (Wave 4 Block 3, Δ4). react-i18next stripped — plain-English copy, this port has
 * no i18n wiring. `OpenIcon` (Block 1 utility set) replaces the inline arrow svg.
 *
 * Numeral + title + host source, mono caption meta — a citation reads as a
 * footnote row, not a card.
 */
interface CitationCardProps {
  citation: ChatCitation
  index?: number
}

function citationHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Resolving against an origin that can never be a real destination and
 *  comparing origins (rather than pattern-matching the prefix) is the only
 *  test that matches what the browser will actually do with the string —
 *  a naive `startsWith('/') && !startsWith('//')` check still lets
 *  `/\evil.com/pwn` through (browsers fold `\` into `/` before resolving),
 *  which resolves off-origin while looking like a same-site path. Ported
 *  from the retired chatbot worker's grounding.ts citationUrl(). */
const SAFE_HREF_RESOLVE_BASE = 'https://citation-href-resolve.invalid'

/** Workers/assistant's `chat-stream.ts` streams `source_url` straight from
 *  whatever `POST /api/admin/reindex` accepted into Vectorize metadata — an
 *  unvalidated `javascript:`/`data:` value reaching `href` here would be
 *  stored XSS. The worker validates on the way in (index.ts isValidSourceUrl)
 *  but this component must not assume that invariant holds for every value
 *  it is ever handed (DesignGallery demo data, a future second producer). */
function isSafeCitationHref(url: string): boolean {
  const trimmed = url.trim()
  if (trimmed === '') return false
  if (trimmed.startsWith('/')) {
    try {
      const resolved = new URL(trimmed, SAFE_HREF_RESOLVE_BASE)
      return resolved.origin === SAFE_HREF_RESOLVE_BASE
    } catch {
      return false
    }
  }
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export default function CitationCard({ citation, index = 0 }: CitationCardProps) {
  const rawUrl = citation.source_url
  const url = rawUrl && isSafeCitationHref(rawUrl) ? rawUrl : null
  const relevance = citation.relevance

  // Retrieval relevance, not confidence. Omitted entirely when the worker had
  // no 0-1 score, rather than shown as 0% or 100%.
  const meta = (
    <span className="cite-src t-caption">
      {url && <>— {citationHost(url)}</>}
      {relevance !== null && Number.isFinite(relevance) && (
        <> · {Math.round(relevance * 100)}% match</>
      )}
    </span>
  )
  const body = (
    <>
      <span className="cite-n">{String(index + 1).padStart(2, '0')}</span>
      <span className="cite-title t-caption">{citation.source_title}</span>
      {meta}
    </>
  )

  return (
    <li>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="cite-link"
          aria-label={`Open source: ${citation.source_title}`}
        >
          {body}
          <OpenIcon size={11} className="cite-open" />
        </a>
      ) : (
        // No link in the corpus row. An <a href=""> would reload the page.
        <span className="cite-link">{body}</span>
      )}
    </li>
  )
}
