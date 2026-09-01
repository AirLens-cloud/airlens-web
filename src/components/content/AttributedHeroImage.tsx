import type { BlogHeroImage } from '../../types/blog'
import BoundedImage from './BoundedImage'

export interface AttributedHeroImageProps {
  image: BlogHeroImage
  /** Mount key so a failed-load state resets across posts — see `BoundedImage` doc. */
  postSlug: string
}

/**
 * Blog post hero image with mandatory source attribution — Wave 4. Reuses
 * `BoundedImage` (hero mode: `placeholderWhenAbsent={false}`) and the
 * `.article-hero` bounded-media rule (aspect-ratio + object-fit:cover +
 * max-height cap) rather than inventing a second image contract.
 *
 * `sourceName`/`sourceUrl` are guaranteed present by the time a
 * `BlogHeroImage` reaches this component — `api/blog.ts` `mapHeroImage`
 * drops the whole field otherwise — so the caption below is never
 * conditionally omitted the way an uncredited image would need to be.
 */
export default function AttributedHeroImage({ image, postSlug }: AttributedHeroImageProps) {
  return (
    <figure className="blogpost-hero">
      <BoundedImage
        key={postSlug}
        src={image.url}
        alt={image.alt ?? ''}
        index={0}
        className="article-hero"
        placeholderWhenAbsent={false}
      />
      <figcaption className="blogpost-hero__caption t-micro">
        Photo:{' '}
        <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
          {image.sourceName}
        </a>
      </figcaption>
    </figure>
  )
}
