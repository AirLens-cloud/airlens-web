/**
 * Legacy path redirects — one table so a reader can see every dead URL this
 * site still answers for, and why.
 *
 * `WEB_PRD.md:871` keeps all six of the old-site paths ("Redirect 6종 (전부
 * 유지) ... 옛 링크·SEO 호환, 유지 비용 0"). They were part of the monorepo web
 * app's router and did not survive the port into this repo, so until now every
 * one of them landed on NotFound — the exact outcome the canon says to avoid.
 *
 * `/weather` joins them from a different decision (DECISIONS-2026-08-28 D4)
 * but behaves identically, so it lives here rather than as a second mechanism.
 *
 * Consumed by `App.tsx`, which turns each row into a `chrome: 'bare'` route
 * rendering `RedirectShim`. Adding a row is the whole job of adding a redirect.
 */
export interface LegacyRedirect {
  /** Dead path, matched exactly. Must not collide with a real page route. */
  from: string
  /** Live destination, including any query string. Must itself be a route. */
  to: string
}

export const LEGACY_REDIRECTS: LegacyRedirect[] = [
  // `WEB_PRD.md:820` — the About page was once `/our-story`.
  { from: '/our-story', to: '/about' },
  // Policy analysis was absorbed into the Insights tabs, so the standalone
  // route stopped existing (`WEB_PRD.md:396` Wave 3 drift correction).
  { from: '/policy', to: '/insights' },
  // Same absorption from the other direction (`WEB_PRD.md:459`).
  { from: '/analytics', to: '/insights' },
  // The news index is `/dispatch` here; `/news/:slug` remains a real route for
  // individual articles, which this exact-match entry does not shadow.
  { from: '/news', to: '/dispatch' },
  // Camera capture moved to the mobile app entirely (`WEB_PRD.md:382`,
  // 2026-05-19). The web keeps only the *reading* of camera-derived values,
  // which lives on Today.
  { from: '/camera', to: '/today' },
  // Legal is a document set with no index page — privacy is its first
  // document (`content/legal.ts` LEGAL_DOCS[0]).
  { from: '/legal', to: '/legal/privacy' },
  // /weather was absorbed into Today (DECISIONS-2026-08-28 D4); the query
  // string pre-selects the tab that used to be the whole page.
  { from: '/weather', to: '/today?tab=conditions' },
]
