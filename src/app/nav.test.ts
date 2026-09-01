// Bidirectional drift test: every nav href must resolve to a real route, and
// every `chrome: 'site'`/`'overlay'` route must be reachable from nav (or
// explicitly excused via NAV_ORPHAN_EXCEPTIONS, which SiteFooter in PR-N2 —
// or a redirect shim — is expected to cover instead).
import { describe, it, expect } from 'vitest'
import { matchRoute } from './router'
import { routes } from '../App'
import { NAV_GROUPS, NAV_ORPHAN_EXCEPTIONS, getActiveGroupKey, isPathCoveredByNav } from './nav'

function allNavHrefs(): string[] {
  const hrefs: string[] = []
  for (const group of NAV_GROUPS) {
    hrefs.push(group.href)
    for (const item of group.items) hrefs.push(item.href)
  }
  return hrefs
}

describe('nav.ts — drift against App.tsx routes', () => {
  it('every nav href resolves against the route table', () => {
    for (const href of allNavHrefs()) {
      expect(matchRoute(href, routes), `nav href "${href}" has no matching route`).not.toBeNull()
    }
  })

  it('every chrome:site/overlay route is reachable from nav or explicitly excused', () => {
    const orphans: string[] = []
    for (const route of routes) {
      const { chrome } = route.render({})
      if (chrome === 'bare') continue
      if (NAV_ORPHAN_EXCEPTIONS.includes(route.path)) continue
      if (!isPathCoveredByNav(route.path)) orphans.push(route.path)
    }
    expect(orphans, `routes with no nav coverage: ${orphans.join(', ')}`).toEqual([])
  })

  it('NAV_ORPHAN_EXCEPTIONS only lists paths that actually exist as routes', () => {
    for (const path of NAV_ORPHAN_EXCEPTIONS) {
      expect(
        routes.some((route) => route.path === path),
        `"${path}" is in NAV_ORPHAN_EXCEPTIONS but is not a route`,
      ).toBe(true)
    }
  })
})

describe('getActiveGroupKey', () => {
  it('matches the root and /today to the today group', () => {
    expect(getActiveGroupKey('/')).toBe('today')
    expect(getActiveGroupKey('/today')).toBe('today')
  })

  it('matches /country/:code (concrete) to the map group', () => {
    expect(getActiveGroupKey('/country/US')).toBe('map')
    expect(getActiveGroupKey('/globe')).toBe('map')
  })

  it('matches article/blog detail pages to the insights group', () => {
    expect(getActiveGroupKey('/news/some-slug')).toBe('insights')
    expect(getActiveGroupKey('/blog/some-slug')).toBe('insights')
    expect(getActiveGroupKey('/dispatch')).toBe('insights')
  })

  it('does not false-positive match an unrelated path with a shared prefix', () => {
    // Regression guard for the naive `startsWith(prefix)` version of this
    // check — "/countryside" must not match the "/country" prefix.
    expect(getActiveGroupKey('/countryside')).not.toBe('map')
  })

  it('returns null outside every group (footer-only pages)', () => {
    expect(getActiveGroupKey('/about')).toBeNull()
    expect(getActiveGroupKey('/faq')).toBeNull()
  })
})
