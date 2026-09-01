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

export default function CitationCard({ citation, index = 0 }: CitationCardProps) {
  const url = citation.source_url
  const relevance = citation.relevance

  // Retrieval relevance, not confidence. Omitted entirely when the worker had
  // no 0-1 score, rather than shown as 0% or 100%.
  const meta = (
    <span className="cite-src">
      {url && <>— {citationHost(url)}</>}
      {relevance !== null && Number.isFinite(relevance) && (
        <> · {Math.round(relevance * 100)}% match</>
      )}
    </span>
  )
  const body = (
    <>
      <span className="cite-n">{String(index + 1).padStart(2, '0')}</span>
      <span className="cite-title">{citation.source_title}</span>
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
