import { useEffect, useState } from 'react'
import { fetchBlogFeed } from '../../api/blog'
import type { BlogFeedResult } from '../../types/blog'
import { formatDate } from '../content/formatDate'
import WfSkeleton from '../wireframe/WfSkeleton'

const STORY_COUNT = 3

/**
 * HomeStoriesResearch — below-the-fold "Stories/Research" block
 * (`home-live-atmospheric-briefing.md` §4 anatomy row 6, §7 interaction).
 *
 * Editorial, not a data surface: "값 렌더 없음" (§7) means no AQI value, unit,
 * tier, or DQSS/DataQuality badge appears here — those belong to the hero
 * above and to Research Commons, a different surface (`BlogCard.tsx`'s same
 * boundary). Stories = latest Field Notes (`fetchBlogFeed`, reused verbatim
 * from `Blog.tsx` — no forked fetch/parsing logic). Research has no feed to
 * fetch yet (`Research.tsx` is a fully static 0-published-receipts page), so
 * this half is a plain editorial teaser linking to `/research`, matching
 * that page's own honest wording rather than inventing a preview API.
 */
export default function HomeStoriesResearch() {
  const [feed, setFeed] = useState<BlogFeedResult | { status: 'loading' }>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchBlogFeed().then((result) => {
      if (!cancelled) setFeed(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const posts = feed.status === 'ready' ? feed.posts.slice(0, STORY_COUNT) : []
  // `fetchBlogFeed` never resolves 'ready' with zero posts (blog.ts's
  // `fetchBlogFeed` returns 'empty' for that case) — the `posts.length === 0`
  // half is a defensive fallback for the same wording, not a reachable branch.
  const showStoriesEmpty = feed.status === 'empty' || (feed.status === 'ready' && posts.length === 0)

  return (
    <section className="home-stories-research" aria-label="Stories and Research">
      <div className="home-stories">
        <h2 className="t-tag">Stories</h2>

        {feed.status === 'loading' && (
          <ul className="home-stories__list" data-testid="home-stories-skeleton">
            {Array.from({ length: STORY_COUNT }, (_, i) => (
              <li key={i} className="home-story-card home-story-card--skeleton">
                <WfSkeleton variant="line" width="70%" height={13} />
                <WfSkeleton variant="line" width="40%" height={11} />
              </li>
            ))}
          </ul>
        )}

        {feed.status === 'unavailable' && (
          <p className="home-stories__empty t-caption" role="alert">
            The Field Notes archive could not be read.
          </p>
        )}

        {showStoriesEmpty && (
          <p className="home-stories__empty t-caption">No Field Notes have been published yet.</p>
        )}

        {feed.status === 'ready' && posts.length > 0 && (
          <ul className="home-stories__list">
            {posts.map((post) => {
              const date = formatDate(post.publishedAt)
              return (
                <li key={post.slug} className="home-story-card">
                  <a className="home-story-card__link" href={`/blog/${post.slug}`}>
                    <span className="home-story-card__title t-body" lang={post.bodyLang ?? undefined}>
                      {post.title}
                    </span>
                    <span className="home-story-card__meta t-micro">
                      {post.topic}
                      {date ? ` · ${date}` : ''}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}

        <a className="home-stories__more t-caption" href="/blog">
          All Field Notes →
        </a>
      </div>

      <div className="home-research">
        <h2 className="t-tag">Research</h2>
        <p className="home-research__eyebrow t-micro">RESEARCH COMMONS · 0 PUBLISHED</p>
        <p className="home-research__body t-caption">
          A reviewed, reproducible-only publication record of analyses built in the Lab — not a results gallery.
          No receipts are published yet.
        </p>
        <a className="home-research__more t-caption" href="/research">
          What a receipt is →
        </a>
      </div>
    </section>
  )
}
