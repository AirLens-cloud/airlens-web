/**
 * PlaceholderThumb — gradient placeholder for a card with no `image_url`.
 * Ported concept from the monorepo `Dispatch.tsx` `PLACEHOLDER_IMGS` cycle
 * (`dispatch-article-signal-desk.md` §8) — cycled by index so a card grid
 * doesn't repeat the same gradient edge-to-edge. Always renders at its
 * container's aspect ratio; never an intrinsic-size broken-image icon.
 */
const VARIANTS = 9

export interface PlaceholderThumbProps {
  index: number
  className?: string
}

export default function PlaceholderThumb({ index, className }: PlaceholderThumbProps) {
  const variant = ((index % VARIANTS) + VARIANTS) % VARIANTS
  const classes = ['content-thumb', 'content-thumb--placeholder', `content-thumb--b${variant + 1}`]
  if (className) classes.push(className)
  return <div className={classes.join(' ')} aria-hidden="true" />
}
