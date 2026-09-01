import type { ReactNode } from 'react'
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
 * The wrapper is a plain `<div id="main">`, not a second `<main>` — every
 * page in this repo already renders its own `<main>` landmark, so nesting
 * one here would violate the one-`<main>`-per-page rule. `tabIndex={-1}`
 * lets the skip link move focus to it even though a `<div>` isn't natively
 * focusable.
 */
export default function SiteChrome({ variant, children }: SiteChromeProps) {
  if (variant === 'bare') return <>{children}</>

  return (
    <div className={`chrome-shell chrome-shell--${variant}`}>
      <GlobalNav variant={variant} />
      <div id="main" className="chrome-main" tabIndex={-1}>
        {children}
      </div>
    </div>
  )
}
