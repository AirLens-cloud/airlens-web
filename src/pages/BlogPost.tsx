/**
 * BlogPost — /blog/:slug. Field Note body. Spec:
 * `Obsidian-airlens/raw/docs/web/page-specs/blog-field-notes.md`.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { fetchBlogPostBySlug } from '../api/blog'
import type { BlogPostLookupResult } from '../types/blog'
import AttributedHeroImage from '../components/content/AttributedHeroImage'
import MarkdownBody from '../components/content/MarkdownBody'
import SourceRefsBlock from '../components/content/SourceRefsBlock'
import VideoEmbed from '../components/content/VideoEmbed'
import WfSkeleton from '../components/wireframe/WfSkeleton'
import { formatDate } from '../components/content/formatDate'
import PublicPageContainer from '../components/wireframe/PublicPageContainer'
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
      <PublicPageContainer tier="hub" className="blogpost-page">
        <WfSkeleton variant="line" width="50%" />
        <WfSkeleton variant="block" height={40} />
        <WfSkeleton variant="block" height={300} />
      </PublicPageContainer>
    )
  }

  if (result.status === 'not-found') {
    return (
      <PublicPageContainer tier="hub" className="blogpost-page">
        <p className="blogpost-notfound t-body">Post not found.</p>
        <a className="blogpost-back t-micro" href="/blog">
          ← Back to Field Notes
        </a>
      </PublicPageContainer>
    )
  }

  if (result.status === 'unavailable') {
    return (
      <PublicPageContainer tier="hub" className="blogpost-page">
        <p className="blogpost-error t-body" role="alert">
          The Field Notes archive could not be read. This is a read failure, not evidence this post doesn't exist.
        </p>
        <a className="blogpost-back t-micro" href="/blog">
          ← Back to Field Notes
        </a>
      </PublicPageContainer>
    )
  }

  const { post } = result
  const date = formatDate(post.publishedAt)
  // Korean-first feed: an absent Korean body with an English one present is a
  // real bilingual-fallback case, but today's feed only ever publishes one —
  // pick whichever exists rather than guessing a preferred language.
  const body = post.bodyKo ?? post.bodyEn

  return (
    <PublicPageContainer tier="hub" className="blogpost-page">
      <header className="blogpost-header fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>
        <div className="blogpost-meta t-micro">
          <span className="content-tag">{post.topic}</span>
          {date ? <span className="content-tag">{date}</span> : null}
          {post.readingMin ? <span className="content-tag">{post.readingMin} min read</span> : null}
        </div>
        <h1 className="blogpost-title h-2" lang={post.bodyLang ?? undefined}>
          {post.title}
        </h1>
        {post.dek ? (
          <p className="blogpost-dek t-lede" lang={post.bodyLang ?? undefined}>
            {post.dek}
          </p>
        ) : null}
      </header>

      {/* Media is fully optional (Wave 4) — no back-filled posts carry it,
          so absence must not shift layout or leave a gap: nothing renders
          when `heroImage`/`video` are null, same as `post.dek` above. */}
      {post.heroImage ? (
        <div className="fluid-enter" style={{ '--enter-i': 1 } as CSSProperties}>
          <AttributedHeroImage image={post.heroImage} postSlug={post.slug} />
        </div>
      ) : null}

      {post.video ? (
        <div className="fluid-enter" style={{ '--enter-i': 2 } as CSSProperties}>
          <VideoEmbed video={post.video} />
        </div>
      ) : null}

      {body ? (
        <div className="fluid-enter" style={{ '--enter-i': 3 } as CSSProperties} lang={post.bodyLang ?? undefined}>
          <MarkdownBody body={body} />
        </div>
      ) : (
        <p className="blogpost-pending t-caption">This post's body is still being prepared.</p>
      )}

      <div className="fluid-enter" style={{ '--enter-i': 4 } as CSSProperties}>
        <SourceRefsBlock refs={post.sourceRefs} />
      </div>

      <a className="blogpost-back t-micro" href="/blog">
        ← Back to Field Notes
      </a>
    </PublicPageContainer>
  )
}
