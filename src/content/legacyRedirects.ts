/**
 * legacyRedirects.ts — NotFound's legacy-path table
 * (page-specs/about-faq-notfound.md §6.1 ③).
 *
 * Two kinds of row:
 *  - `explain`: the old route's purpose is gone (accounts don't exist), so
 *    NotFound explains why rather than redirecting anywhere.
 *  - `redirect`: the old route's function was absorbed by a real page, so
 *    NotFound offers a direct link to it.
 */

export type LegacyRedirectKind = 'explain' | 'redirect'

export interface LegacyRedirectEntry {
  path: string
  kind: LegacyRedirectKind
  /** Present only for kind: 'redirect'. */
  target?: string
  reason: string
}

export const LEGACY_REDIRECTS: LegacyRedirectEntry[] = [
  {
    path: '/auth',
    kind: 'explain',
    reason: 'AirLens has no accounts, so there is nothing to sign in to. This page no longer exists.',
  },
  {
    path: '/auth/callback',
    kind: 'explain',
    reason: 'AirLens has no accounts, so there is no sign-in flow to complete. This page no longer exists.',
  },
  {
    path: '/profile',
    kind: 'explain',
    reason: 'AirLens has no accounts, so there is no profile to manage. This page no longer exists.',
  },
  {
    path: '/insights/transparency',
    kind: 'redirect',
    target: '/methodology',
    reason: 'Inference explanations moved into the Evidence Rail (per value) and the Methods Library (per method).',
  },
  {
    path: '/report/scenario',
    kind: 'redirect',
    target: '/insights',
    reason: 'Scenario runs are now published as versioned, public results on Insights instead of an account-bound execution.',
  },
]

/**
 * Matches a request pathname against the legacy table. Exact match for the
 * account-related routes; prefix match for `/report/scenario/:runId`-style
 * dynamic paths.
 */
export function matchLegacyRedirect(pathname: string): LegacyRedirectEntry | undefined {
  return LEGACY_REDIRECTS.find((entry) => pathname === entry.path || pathname.startsWith(`${entry.path}/`))
}
