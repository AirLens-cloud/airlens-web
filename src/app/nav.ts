/**
 * nav.ts — single source of truth for the global site navigation (PR-N1).
 *
 * The site has no router with history management (see `./router.ts`), so
 * every nav/footer link is a plain `<a href>`. This module owns *what* the
 * links are; `GlobalNav.tsx` owns how they're rendered, and `nav.test.ts`
 * checks every href here actually resolves against `App.tsx`'s route table
 * (and, in the other direction, that no `chrome: 'site'` route is missing
 * from nav entirely).
 *
 * Each group's disclosure always gets an "Overview" link to `href` as its
 * first entry (added by GlobalNav, not listed in `items` here) — see the
 * design doc's D2: the trigger button only toggles the dropdown, it never
 * doubles as a link itself, so the landing page needs its own list entry.
 */

export interface NavItem {
  label: string
  href: string
  /** Renders a small "beta" tag next to the label (e.g. Lab). */
  beta?: boolean
}

export interface NavGroup {
  key: string
  label: string
  /** The group's landing page — also used for the "Overview" dropdown entry. */
  href: string
  items: NavItem[]
  /**
   * Pathname prefixes that count as "inside this group" for `aria-current`
   * purposes — checked via exact match or `prefix + '/'` so `/country`
   * matches `/country/US` without also matching an unrelated `/countryX`.
   */
  match: string[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'today',
    label: 'Today',
    href: '/',
    // Home and Today are still separate surfaces (their consolidation is a
    // later PR — DECISIONS-2026-08-28 area), so the group's own dropdown
    // carries a link to the Today briefing distinct from the "Overview"
    // (Home) entry GlobalNav prepends.
    items: [{ label: 'Today', href: '/today' }],
    match: ['/', '/today'],
  },
  {
    key: 'map',
    label: 'Map',
    href: '/globe',
    items: [],
    match: ['/globe', '/country'],
  },
  {
    key: 'insights',
    label: 'Insights',
    href: '/insights',
    items: [
      { label: 'Dispatch', href: '/dispatch' },
      { label: 'Blog', href: '/blog' },
    ],
    match: ['/insights', '/dispatch', '/news', '/blog'],
  },
  {
    key: 'trust',
    label: 'Data Trust',
    href: '/trust',
    items: [
      { label: 'Datasets', href: '/datasets' },
      { label: 'Data Sources', href: '/data-sources' },
      { label: 'Methodology', href: '/methodology' },
    ],
    match: ['/trust', '/datasets', '/data-sources', '/methodology'],
  },
  {
    key: 'learn',
    label: 'Learn',
    href: '/learn',
    items: [
      { label: 'Research', href: '/research' },
      { label: 'Glossary', href: '/glossary' },
      { label: 'Lab', href: '/lab', beta: true },
    ],
    match: ['/learn', '/research', '/glossary', '/lab'],
  },
]

/**
 * `chrome: 'site'` routes that are intentionally absent from nav — they'll
 * be covered by `SiteFooter` in PR-N2 (About/FAQ/Legal), or aren't a real
 * page at all (`/weather` is a redirect shim, already `chrome: 'bare'`).
 * `nav.test.ts`'s orphan-route check reads this list so it doesn't fail on
 * pages that are deliberately footer-only for now.
 */
export const NAV_ORPHAN_EXCEPTIONS = ['/legal/:doc', '/about', '/faq']

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** Returns the key of the group `pathname` belongs to, or `null` outside all of them. */
export function getActiveGroupKey(pathname: string, groups: NavGroup[] = NAV_GROUPS): string | null {
  for (const group of groups) {
    if (group.match.some((prefix) => matchesPrefix(pathname, prefix))) return group.key
  }
  return null
}

/**
 * True if `path` (a route pattern like `/country/:code`, or a concrete href)
 * is reachable from nav — as a group's `href`/`Overview` link, an explicit
 * item href, or covered by a group's `match` prefix.
 */
export function isPathCoveredByNav(path: string, groups: NavGroup[] = NAV_GROUPS): boolean {
  for (const group of groups) {
    if (group.href === path) return true
    if (group.items.some((item) => item.href === path)) return true
    if (group.match.some((prefix) => matchesPrefix(path, prefix))) return true
  }
  return false
}
