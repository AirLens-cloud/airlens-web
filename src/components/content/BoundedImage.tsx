import { useState } from 'react'
import PlaceholderThumb from './PlaceholderThumb'

export interface BoundedImageProps {
  src: string | null
  alt: string
  /** Cycles the placeholder gradient — see `PlaceholderThumb`. */
  index: number
  className?: string
  /**
   * `true` (default, Dispatch card): a missing `src` renders the gradient
   * placeholder — every card shows *something*. `false` (Article hero,
   * optional bonus media): a missing `src` renders nothing at all, matching
   * the pre-fix behavior of omitting the hero section entirely when the feed
   * carries no image. Either way, a `src` that IS provided but fails to
   * *load* always falls back to the placeholder, never the browser's
   * broken-image icon (the bug this component fixes).
   */
  placeholderWhenAbsent?: boolean
}

/**
 * Bounded, always-safe article image. A load failure (hotlink block, dead
 * URL, CORS) falls through to `onError` and swaps in the gradient
 * placeholder rather than painting the browser's default broken-image icon,
 * which QA found on several Dispatch cards (2026-09-01). Mount with
 * `key={slug}` (or an equivalent per-article key) so the failed-load state
 * resets when the image identity changes instead of sticking from a
 * previous article.
 */
export default function BoundedImage({ src, alt, index, className, placeholderWhenAbsent = true }: BoundedImageProps) {
  const [failed, setFailed] = useState(false)

  if (!src) {
    return placeholderWhenAbsent ? <PlaceholderThumb index={index} className={className} /> : null
  }
  if (failed) {
    return <PlaceholderThumb index={index} className={className} />
  }

  const classes = ['content-thumb']
  if (className) classes.push(className)

  return (
    <img
      className={classes.join(' ')}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
