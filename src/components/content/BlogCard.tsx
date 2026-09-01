import type { BlogPostSummary } from '../../types/blog'
import { formatDate } from './formatDate'

export interface BlogCardProps {
  post: BlogPostSummary
  onOpen: (slug: string) => void
}

/**
 * Blog index card — `blog-field-notes.md` §4.1. No DataQuality/DQSS/
 * "reproducible" badge anywhere on this card (§1 boundary, acceptance test
 * #6) — those belong to Research Commons, a different surface this repo has
 * not built yet.
 */
export default function BlogCard({ post, onOpen }: BlogCardProps) {
  const date = formatDate(post.publishedAt)
  return (
    <article className="content-card blog-card">
      <button type="button" className="blog-card__open" onClick={() => onOpen(post.slug)} aria-label={`Open post: ${post.title}`}>
        <div className="blog-card__meta t-micro">
          <span className="content-tag">{post.topic}</span>
          {date ? <span className="content-tag">{date}</span> : null}
        </div>
        <h3 className="blog-card__title t-body">{post.title}</h3>
        {post.dek ? <p className="blog-card__dek t-caption">{post.dek}</p> : null}
        <p className="blog-card__footer t-micro">
          {post.readingMin ? `${post.readingMin} min read · ` : ''}
          SRC ×{post.sourceRefsCount}
        </p>
      </button>
    </article>
  )
}
