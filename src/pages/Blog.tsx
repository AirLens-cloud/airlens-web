/**
 * Blog — /blog. Field Notes index. Spec:
 * `Obsidian-airlens/raw/docs/web/page-specs/blog-field-notes.md`.
 */
import { useEffect, useMemo, useState } from 'react'
import { fetchBlogFeed } from '../api/blog'
import { BLOG_TOPICS, type BlogFeedResult } from '../types/blog'
import BlogCard from '../components/content/BlogCard'
import WfSegmented from '../components/wireframe/WfSegmented'
import WfSkeleton from '../components/wireframe/WfSkeleton'
import PublicPageContainer from '../components/wireframe/PublicPageContainer'
import '../styles/content.css'

const TOPIC_PARAM = 'topic'

function readTopicParam(): string {
  if (typeof window === 'undefined') return 'all'
  return new URLSearchParams(window.location.search).get(TOPIC_PARAM) ?? 'all'
}

export interface BlogProps {
  onNavigate?: (path: string) => void
}

export default function Blog({ onNavigate }: BlogProps = {}) {
  const [feed, setFeed] = useState<BlogFeedResult | { status: 'loading' }>({ status: 'loading' })
  const [topic, setTopic] = useState<string>(readTopicParam)

  useEffect(() => {
    let cancelled = false
    fetchBlogFeed().then((r) => {
      if (!cancelled) setFeed(r)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (topic === 'all') params.delete(TOPIC_PARAM)
    else params.set(TOPIC_PARAM, topic)
    const qs = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [topic])

  const filtered = useMemo(() => {
    const posts = feed.status === 'ready' ? feed.posts : []
    return topic === 'all' ? posts : posts.filter((p) => p.topic === topic)
  }, [feed, topic])

  function handleOpen(slug: string): void {
    if (onNavigate) onNavigate(`/blog/${slug}`)
    else if (typeof window !== 'undefined') window.location.href = `/blog/${slug}`
  }

  const chipItems = [{ key: 'all', label: 'All' }, ...BLOG_TOPICS.map((t) => ({ key: t, label: t }))]

  return (
    <PublicPageContainer tier="hub" className="blog-page">
      <header className="blog-header">
        <h1 className="blog-title h-2">Field Notes</h1>
        <p className="blog-dek t-body">
          AirLens's own data stories, methods, and failure reports — not a summary of someone else's reporting.
        </p>
      </header>

      {feed.status !== 'loading' && feed.status !== 'unavailable' && (
        <WfSegmented items={chipItems} activeKey={topic} onChange={setTopic} ariaLabel="Filter by topic" />
      )}

      {feed.status === 'loading' && (
        <div className="blog-grid" data-testid="blog-skeleton">
          {Array.from({ length: 4 }, (_, i) => (
            <WfSkeleton key={i} variant="block" height={220} />
          ))}
        </div>
      )}

      {feed.status === 'unavailable' && (
        <p className="blog-empty t-caption" role="alert">
          The Field Notes archive could not be read.
        </p>
      )}

      {feed.status === 'empty' && <p className="blog-empty t-caption">No Field Notes have been published yet.</p>}

      {feed.status === 'ready' && filtered.length === 0 && (
        <p className="blog-empty t-caption">
          No posts match this filter.{' '}
          <button type="button" className="blog-empty__reset" onClick={() => setTopic('all')}>
            Clear filter
          </button>
        </p>
      )}

      {feed.status === 'ready' && filtered.length > 0 && (
        <div className="blog-grid">
          {filtered.map((post) => (
            <BlogCard key={post.slug} post={post} onOpen={handleOpen} />
          ))}
        </div>
      )}
    </PublicPageContainer>
  )
}
