/**
 * Dispatch — /dispatch. The Signal Desk: a curated air-quality news card
 * grid. Spec: `Obsidian-airlens/raw/docs/web/page-specs/dispatch-article-signal-desk.md`.
 *
 * Category chips and pagination are client-side over one feed fetch (400
 * rows today) — no server-side filtering endpoint exists, and the feed is
 * small enough that fetching it once and filtering in memory is honest and
 * simple rather than a premature "paginated API" this repo doesn't have.
 */
import { useEffect, useMemo, useState } from 'react'
import { fetchDispatchFeed } from '../api/news'
import type { DispatchFeedResult, NewsArticle } from '../types/news'
import ArticleCard from '../components/content/ArticleCard'
import WfSegmented from '../components/wireframe/WfSegmented'
import WfSkeleton from '../components/wireframe/WfSkeleton'
import WfPagination from '../components/wireframe/WfPagination'
import PublicPageContainer from '../components/wireframe/PublicPageContainer'
import '../styles/content.css'

const CATEGORY_PARAM = 'category'
const PAGE_SIZE = 12

function readCategoryParam(): string {
  if (typeof window === 'undefined') return 'all'
  return new URLSearchParams(window.location.search).get(CATEGORY_PARAM) ?? 'all'
}

export interface DispatchProps {
  /** Test seam — overrides navigation instead of touching `window.location`. */
  onNavigate?: (path: string) => void
}

export default function Dispatch({ onNavigate }: DispatchProps = {}) {
  const [feed, setFeed] = useState<DispatchFeedResult | { status: 'loading' }>({ status: 'loading' })
  const [category, setCategory] = useState<string>(readCategoryParam)
  const [visible, setVisible] = useState(PAGE_SIZE)

  useEffect(() => {
    let cancelled = false
    fetchDispatchFeed().then((result) => {
      if (!cancelled) setFeed(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (category === 'all') params.delete(CATEGORY_PARAM)
    else params.set(CATEGORY_PARAM, category)
    const qs = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [category])

  const categories: string[] = feed.status === 'ready' ? feed.categories : []

  const filtered = useMemo(() => {
    const articles: NewsArticle[] = feed.status === 'ready' ? feed.articles : []
    return category === 'all' ? articles : articles.filter((a) => a.category === category)
  }, [feed, category])
  const page = filtered.slice(0, visible)

  // A filter change starts a fresh result set — "loaded 12 of 3" from a
  // stale `visible` count (carried over from a wider category) is a broken
  // pagination affordance, not a convenience.
  function handleCategoryChange(next: string): void {
    setCategory(next)
    setVisible(PAGE_SIZE)
  }

  function handleOpen(slug: string): void {
    if (onNavigate) onNavigate(`/news/${slug}`)
    else if (typeof window !== 'undefined') window.location.href = `/news/${slug}`
  }

  const chipItems = [
    { key: 'all', label: 'All' },
    ...categories.map((c) => ({ key: c, label: c })),
  ]

  return (
    <PublicPageContainer tier="hub" className="dispatch-page">
      <header className="dispatch-header">
        <p className="dispatch-eyebrow t-micro">DISPATCH · SIGNAL DESK</p>
        <h1 className="dispatch-title h-2">What's happening in air quality right now</h1>
      </header>

      {feed.status !== 'loading' && feed.status !== 'unavailable' && categories.length > 0 && (
        <WfSegmented items={chipItems} activeKey={category} onChange={handleCategoryChange} ariaLabel="Filter by category" />
      )}

      {feed.status === 'loading' && (
        <div className="dispatch-grid" data-testid="dispatch-skeleton">
          {Array.from({ length: 6 }, (_, i) => (
            <WfSkeleton key={i} variant="block" height={280} />
          ))}
        </div>
      )}

      {feed.status === 'unavailable' && (
        <p className="dispatch-empty t-caption" role="alert">
          The news feed could not be read. This is a failure to load it, not a statement that nothing is
          happening — nothing here is invented in its place.
        </p>
      )}

      {feed.status === 'empty' && (
        <p className="dispatch-empty t-caption">No articles have been published yet.</p>
      )}

      {feed.status === 'ready' && filtered.length === 0 && (
        <p className="dispatch-empty t-caption">
          No articles match this filter.{' '}
          <button type="button" className="dispatch-empty__reset" onClick={() => handleCategoryChange('all')}>
            Clear filter
          </button>
        </p>
      )}

      {feed.status === 'ready' && page.length > 0 && (
        <>
          <div className="dispatch-grid">
            {page.map((article, i) => (
              <ArticleCard key={article.slug} article={article} index={i} onOpen={handleOpen} />
            ))}
          </div>
          <WfPagination
            mode="load-more"
            loaded={page.length}
            total={filtered.length}
            onLoadMore={() => setVisible((v) => v + PAGE_SIZE)}
            label="Load more"
            ariaLabel="Load more articles"
          />
        </>
      )}
    </PublicPageContainer>
  )
}
