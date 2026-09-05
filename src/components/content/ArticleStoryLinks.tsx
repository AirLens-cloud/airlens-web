import { useEffect, useState } from 'react'
import { fetchPolicyIndex } from '../../api/policy'
import { countryName } from '../../lib/countryName'
import type { NewsArticle } from '../../types/news'

export interface ArticleStoryLinksProps {
  article: Pick<NewsArticle, 'countryCode' | 'region'>
  className?: string
}

type EvidenceLookup = 'pending' | 'present' | 'absent'

/**
 * ArticleStoryLinks — "COUNTRY IN THIS STORY" / "EVIDENCE DATASET" hairline
 * 2-column band on `/news/:slug`, above the ◆ AirLens analysis (evidence)
 * block. Mockup gate G2, approved 2026-09-05.
 *
 * Distinct from `NewsCrossLinks` (the lighter chip row this page and the
 * Dispatch card already share): that row's evidence chip names the
 * article's own `sourceName`. This band's right column instead points at a
 * real published SDID artifact — presence is read from the same
 * `policy-impact/index.json` `api/policy.ts` already exposes, no new fetch
 * path. A country absent from that index (or an index the page fails to
 * read) folds the band to one column rather than rendering an empty or
 * broken second column — absence and failure both read the same way here,
 * because neither is evidence the article's own left column should hide.
 *
 * The left column never depends on the index fetch — it is backed entirely
 * by the article's own fields, so it renders synchronously and stays put
 * even if the index read never resolves (§5 independent-failure principle,
 * same as `ArticleEvidenceBlock`).
 */
export default function ArticleStoryLinks({ article, className }: ArticleStoryLinksProps) {
  const [lookup, setLookup] = useState<EvidenceLookup>('pending')

  useEffect(() => {
    if (!article.countryCode) return
    let cancelled = false
    const cc = article.countryCode.toUpperCase()
    fetchPolicyIndex().then((index) => {
      if (cancelled) return
      setLookup(index.some((e) => e.countryCode.toUpperCase() === cc) ? 'present' : 'absent')
    })
    return () => {
      cancelled = true
    }
  }, [article.countryCode])

  if (!article.countryCode) return null

  const code = article.countryCode.toUpperCase()
  const name = countryName(code) ?? code
  const classes = ['article-story-links']
  if (className) classes.push(className)

  return (
    <div className={classes.join(' ')}>
      <div className="article-story-links__col">
        <span className="article-story-links__label t-micro">Country in this story</span>
        <a className="article-story-links__value t-body" href={`/country/${code}`}>
          {name} →
        </a>
        {article.region ? <span className="article-story-links__meta t-caption">{article.region}</span> : null}
      </div>
      {lookup === 'present' ? (
        <div className="article-story-links__col">
          <span className="article-story-links__label t-micro">Evidence dataset</span>
          <a className="article-story-links__value t-body" href={`/country/${code}#cat-policy-title`}>
            SDID policy-impact — {name} →
          </a>
        </div>
      ) : null}
    </div>
  )
}
