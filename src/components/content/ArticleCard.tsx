import type { NewsArticle } from '../../types/news'
import EditorialTrustBadge from './EditorialTrustBadge'
import BoundedImage from './BoundedImage'
import { formatDate } from './formatDate'
import { truncateText } from './htmlToText'

export interface ArticleCardProps {
  article: NewsArticle
  index: number
  onOpen: (slug: string) => void
}

const SUMMARY_CARD_MAX_CHARS = 200

/**
 * Dispatch card — `dispatch-article-signal-desk.md` §4.1: meta row holds
 * category · source · date and NOTHING else (acceptance test #2, ≤3 badges).
 * EditorialTrust is a separate, differently-styled badge, not a 4th meta
 * chip — folding it into the same row would blur the "which axis is this"
 * distinction §8 requires.
 */
export default function ArticleCard({ article, index, onOpen }: ArticleCardProps) {
  const date = formatDate(article.publishedAt)
  const rawSummary = article.summary ?? article.summaryEn ?? article.summaryKo
  const summary = rawSummary ? truncateText(rawSummary, SUMMARY_CARD_MAX_CHARS) : null

  return (
    <article className="content-card dispatch-card">
      <button
        type="button"
        className="dispatch-card__open"
        onClick={() => onOpen(article.slug)}
        aria-label={`Open article: ${article.title}`}
      >
        <BoundedImage src={article.imageUrl} alt="" index={index} />
        <div className="dispatch-card__body">
          <div className="dispatch-card__meta t-micro" data-testid="dispatch-card-meta">
            {article.category ? <span className="content-tag">{article.category}</span> : null}
            {article.sourceName ? <span className="content-tag">{article.sourceName}</span> : null}
            {date ? <span className="content-tag">{date}</span> : null}
          </div>
          <h3 className="dispatch-card__title t-body">{article.title}</h3>
          {summary ? <p className="dispatch-card__summary t-caption">{summary}</p> : (
            <p className="dispatch-card__summary dispatch-card__summary--pending t-caption">
              No summary generated — original link only.
            </p>
          )}
          <EditorialTrustBadge trust={article.editorialTrust} className="dispatch-card__trust" />
        </div>
      </button>
    </article>
  )
}
