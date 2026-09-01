import { useState, type ReactNode } from 'react'
import GlobalNav from './GlobalNav'

export type ChromeVariant = 'site' | 'overlay' | 'bare'

interface SiteChromeProps {
  variant: ChromeVariant
  children: ReactNode
}

/**
 * SiteChrome — mounts the global chrome around a route's rendered page
 * (PR-N1; see `App.tsx`'s route table for the `chrome` field per route).
 *
 *   'site'    → GlobalNav (footer lands in PR-N2 — deliberately absent here)
 *   'overlay' → GlobalNav only, transparent-on-dark variant, no footer
 *               (/globe — a 100vh stage; a footer would be destructive, but
 *               shipping with no nav at all leaves no way out)
 *   'bare'    → nothing (/design, /landing, /probe — dev tools and the
 *               immersive landing flight, which owns its own chrome)
 *
 * The wrapper is a plain `<div id="main">`, not a second `<main>`. Every
 * `chrome: 'site'`/`'overlay'` page renders its own `<main>` landmark — this
 * was checked page by page (`grep -n '<main' src/pages/*.tsx`), not assumed;
 * `Globe.tsx` was the one gap (its root was a bare `<div>`) and was promoted
 * to `<main>` as part of this same review round, so nesting a second `<main>`
 * here would now violate the one-`<main>`-per-page rule everywhere.
 * `tabIndex={-1}` lets the skip link move focus to the div even though it
 * isn't natively focusable.
 */
export default function SiteChrome({ variant, children }: SiteChromeProps) {
  // Mobile nav panel focus trap (review round 1, WCAG 2.4.3/2.1.1) —
  // GlobalNav owns the open/closed boolean but reports it up here so the
  // page content underneath can be made `inert` while the panel covers it.
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (variant === 'bare') return <>{children}</>

  return (
    <div className={`chrome-shell chrome-shell--${variant}`}>
      <GlobalNav variant={variant} onMobileOpenChange={setMobileNavOpen} />
      <div id="main" className="chrome-main" tabIndex={-1} inert={mobileNavOpen}>
        {children}
      </div>
    </div>
  )
}
