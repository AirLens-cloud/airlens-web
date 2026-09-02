import { countryName } from '../../lib/countryName'
import type { NewsArticle } from '../../types/news'

export interface NewsCrossLinksProps {
  article: Pick<NewsArticle, 'countryCode' | 'sourceName'>
  className?: string
}

/**
 * NewsCrossLinks — "article -> related country + evidence" chip row (UI
 * Tier-1 P2-B, uiux-evaluation-manyfast-2026-09-02 §4 G2). Shared by the
 * Dispatch card and the article detail page so a reader never dead-ends on
 * a news item with no path to the data behind it.
 *
 * Every chip is conditional on real article data — never fabricated:
 *   - Country: only when `countryCode` is present AND resolves to a real
 *     name (`countryName`, Intl.DisplayNames) — no bare ISO code chips.
 *   - Evidence: only when `sourceName` is present, labeled with that literal
 *     source, not a hardcoded "OpenAQ feed" guess (the feed carries no
 *     per-article evidence-dataset field to name honestly).
 *   - Methodology: always available (a fixed site link, not article data).
 *
 * A distinct component from `ArticleEvidenceBlock` (which does a full
 * country-panel/policy-effect deep dive on `/news/:slug` already) — this is
 * the lightweight discovery layer the card also needs, and links to the
 * Country Profile page directly (`/country/:code`) rather than the
 * Insights deep-dive `ArticleEvidenceBlock` links to.
 */
export default function NewsCrossLinks({ article, className }: NewsCrossLinksProps) {
  const name = countryName(article.countryCode)
  const classes = ['news-chips']
  if (className) classes.push(className)

  if (!name && !article.sourceName) {
    // Methodology alone isn't worth a chip row — every article would show
    // an identical one, adding noise instead of a real cross-link.
    return null
  }

  return (
    <div className={classes.join(' ')}>
      {name && article.countryCode ? (
        <a className="news-chip t-caption" href={`/country/${article.countryCode}`}>
          {article.countryCode} · {name} profile →
        </a>
      ) : null}
      {article.sourceName ? (
        <a className="news-chip news-chip--muted t-caption" href="/data-sources">
          Evidence: {article.sourceName}
        </a>
      ) : null}
    </div>
  )
}
