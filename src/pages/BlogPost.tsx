/**
 * BlogPost — /blog/:slug. Field Note body. Spec:
 * `Obsidian-airlens/raw/docs/web/page-specs/blog-field-notes.md`.
 */
import { useEffect, useState } from 'react'
import { fetchBlogPostBySlug } from '../api/blog'
import type { BlogPostLookupResult } from '../types/blog'
import MarkdownBody from '../components/content/MarkdownBody'
import SourceRefsBlock from '../components/content/SourceRefsBlock'
import WfSkeleton from '../components/wireframe/WfSkeleton'
import { formatDate } from '../components/content/formatDate'
import '../styles/content.css'

export interface BlogPostProps {
  slug: string
}

export default function BlogPost({ slug }: BlogPostProps) {
  const [resolved, setResolved] = useState<{ slug: string; result: BlogPostLookupResult } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchBlogPostBySlug(slug).then((r) => {
      if (!cancelled) setResolved({ slug, result: r })
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  // Lags a slug change until its own fetch lands (avoids setting state
  // synchronously inside the effect — react-hooks/set-state-in-effect).
  const result: BlogPostLookupResult | { status: 'loading' } =
    resolved && resolved.slug === slug ? resolved.result : { status: 'loading' }

  if (result.status === 'loading') {
    return (
      <main className="blogpost-page">
        <WfSkeleton variant="line" width="50%" />
        <WfSkeleton variant="block" height={40} />
        <WfSkeleton variant="block" height={300} />
      </main>
    )
  }

  if (result.status === 'not-found') {
    return (
      <main className="blogpost-page">
        <p className="blogpost-notfound t-body">Post not found.</p>
        <a className="blogpost-back t-micro" href="/blog">
          ← Back to Field Notes
        </a>
      </main>
    )
  }

  if (result.status === 'unavailable') {
    return (
      <main className="blogpost-page">
        <p className="blogpost-error t-body" role="alert">
          The Field Notes archive could not be read. This is a read failure, not evidence this post doesn't exist.
        </p>
        <a className="blogpost-back t-micro" href="/blog">
          ← Back to Field Notes
        </a>
      </main>
    )
  }

  const { post } = result
  const date = formatDate(post.publishedAt)
  // Korean-first feed: an absent Korean body with an English one present is a
  // real bilingual-fallback case, but today's feed only ever publishes one —
  // pick whichever exists rather than guessing a preferred language.
  const body = post.bodyKo ?? post.bodyEn

  return (
    <main className="blogpost-page">
      <header className="blogpost-header">
        <div className="blogpost-meta t-micro">
          <span className="content-tag">{post.topic}</span>
          {date ? <span className="content-tag">{date}</span> : null}
          {post.readingMin ? <span className="content-tag">{post.readingMin} min read</span> : null}
        </div>
        <h1 className="blogpost-title h-2">{post.title}</h1>
        {post.dek ? <p className="blogpost-dek t-lede">{post.dek}</p> : null}
      </header>

      {body ? (
        <MarkdownBody body={body} />
      ) : (
        <p className="blogpost-pending t-caption">This post's body is still being prepared.</p>
      )}

      <SourceRefsBlock refs={post.sourceRefs} />

      <a className="blogpost-back t-micro" href="/blog">
        ← Back to Field Notes
      </a>
    </main>
  )
}
