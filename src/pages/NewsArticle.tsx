/**
 * NewsArticle — /news/:slug. Evidence-aware article detail.
 * Spec: `Obsidian-airlens/raw/docs/web/page-specs/dispatch-article-signal-desk.md`.
 *
 * No router in this repo (`App.tsx` comment) — `slug` arrives as a prop from
 * the caller's pathname parse, per this task's ownership split.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { fetchArticleBySlug } from '../api/news'
import type { ArticleLookupResult } from '../types/news'
import EditorialTrustBadge from '../components/content/EditorialTrustBadge'
import ArticleEvidenceBlock from '../components/content/ArticleEvidenceBlock'
import NewsCrossLinks from '../components/content/NewsCrossLinks'
import ArticleStoryLinks from '../components/content/ArticleStoryLinks'
import BoundedImage from '../components/content/BoundedImage'
import WfBreadcrumb from '../components/wireframe/WfBreadcrumb'
import WfSkeleton from '../components/wireframe/WfSkeleton'
import WfStamp from '../components/wireframe/WfStamp'
import { formatDate } from '../components/content/formatDate'
import PublicPageContainer from '../components/wireframe/PublicPageContainer'
import '../styles/content.css'

export interface NewsArticleProps {
  slug: string
}

export default function NewsArticle({ slug }: NewsArticleProps) {
  const [resolved, setResolved] = useState<{ slug: string; result: ArticleLookupResult } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchArticleBySlug(slug).then((r) => {
      if (!cancelled) setResolved({ slug, result: r })
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  // `resolved` lags a slug change until its own fetch lands (avoids setting
  // state synchronously inside the effect — react-hooks/set-state-in-effect)
  // — so a stale result never renders under a new slug.
  const result: ArticleLookupResult | { status: 'loading' } =
    resolved && resolved.slug === slug ? resolved.result : { status: 'loading' }

  if (result.status === 'loading') {
    return (
      <PublicPageContainer tier="hub" className="article-page">
        <WfSkeleton variant="line" width="60%" />
        <WfSkeleton variant="block" height={40} />
        <WfSkeleton variant="block" height={300} />
      </PublicPageContainer>
    )
  }

  if (result.status === 'not-found') {
    return (
      <PublicPageContainer tier="hub" className="article-page">
        <p className="article-notfound t-body">Article not found.</p>
        <a className="article-back t-micro" href="/dispatch">
          ← Back to Dispatch
        </a>
      </PublicPageContainer>
    )
  }

  if (result.status === 'unavailable') {
    return (
      <PublicPageContainer tier="hub" className="article-page">
        <p className="article-error t-body" role="alert">
          The news feed could not be read. This is a read failure, not evidence that this article doesn't exist.
        </p>
        <a className="article-back t-micro" href="/dispatch">
          ← Back to Dispatch
        </a>
      </PublicPageContainer>
    )
  }

  const { article } = result
  const date = formatDate(article.publishedAt)
  const summary = article.summaryEn ?? article.summaryKo ?? article.summary

  return (
    <PublicPageContainer tier="hub" className="article-page">
      <WfBreadcrumb
        items={[
          { key: 'dispatch', label: 'Dispatch', href: '/dispatch' },
          { key: 'article', label: article.title },
        ]}
        ariaLabel="Breadcrumb"
      />

      <div className="article-meta t-micro">
        {article.category ? <span className="content-tag">{article.category}</span> : null}
        <EditorialTrustBadge trust={article.editorialTrust} />
        {article.sourceName ? <span className="content-tag">{article.sourceName}</span> : null}
        {date ? <span className="content-tag">{date}</span> : null}
      </div>

      <h1 className="article-title h-2 fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>{article.title}</h1>

      <div className="fluid-enter" style={{ '--enter-i': 1 } as CSSProperties}>
        <BoundedImage
          key={article.slug}
          src={article.imageUrl}
          alt=""
          index={0}
          className="article-hero"
          placeholderWhenAbsent={false}
        />
      </div>

      <section className="content-summary fluid-enter" style={{ '--enter-i': 2 } as CSSProperties} aria-label="AirLens summary">
        <WfStamp label="■ AirLens summary" variant="primary" />
        {summary ? (
          <>
            <p className="content-summary__body t-body">{summary}</p>
            <p className="content-summary__caveat t-caveat">
              This is a generated summary, not the original article's own words — it may omit context. It is not an
              assertion by AirLens.
            </p>
          </>
        ) : (
          <p className="content-summary__pending t-caption">Summary not yet generated — see the link below.</p>
        )}
        {article.articleUrl ? (
          <a className="article-original-link t-micro" href={article.articleUrl} target="_blank" rel="noopener noreferrer">
            Read the original →
          </a>
        ) : null}
      </section>

      <NewsCrossLinks article={article} className="article-cross-links fluid-enter" />

      <ArticleStoryLinks article={article} className="fluid-enter" />

      <div className="fluid-enter" style={{ '--enter-i': 3 } as CSSProperties}>
        <ArticleEvidenceBlock countryCode={article.countryCode} />
      </div>

      <a className="article-back t-micro" href="/dispatch">
        ← Back to Dispatch
      </a>
    </PublicPageContainer>
  )
}
