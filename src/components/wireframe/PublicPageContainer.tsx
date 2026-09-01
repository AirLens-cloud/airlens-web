import type { PublicPageContainerProps } from './types'

/**
 * PublicPageContainer — 3-tier layout contract for public pages.
 * Ported from AirLens-platform apps/web/src/components/wireframe/PublicPageContainer.tsx.
 *
 * tier="text" → reading-heavy (Faq / Glossary / DataSources / Legal / About) — max-width 720px
 * tier="hub"  → editorial/hub (Insights / Catalog / Research / Blog) — max-width var(--shell)
 * tier="wide" → full-bleed immersive (Home / Globe) — max-width 100vw
 *
 * Visual rules live in src/styles/wireframe.css under `.public-page-container[data-tier]`.
 * OBSERVATORY obs-surface pages are a 4th layer that does not replace tier — it composes
 * with it (design-taxonomy.md §표면 예외).
 */
export default function PublicPageContainer({
  tier,
  children,
  as: Tag = 'main',
  className,
  ...dataProps
}: PublicPageContainerProps) {
  const classes = ['public-page-container', className].filter(Boolean).join(' ')
  const forwarded = Object.fromEntries(
    Object.entries(dataProps).filter(([key]) => key.startsWith('data-')),
  )
  return (
    <Tag className={classes} data-tier={tier} {...forwarded}>
      {children}
    </Tag>
  )
}
