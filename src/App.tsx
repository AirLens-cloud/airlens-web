import { DataProbe } from './pages/DataProbe'
import DesignGallery from './pages/DesignGallery'
import LandingFlight from './pages/LandingFlight'
import Globe from './pages/Globe'
import { Suspense, lazy, useEffect, type JSX } from 'react'
import Today from './pages/Today'
import Home from './pages/Home'
import FluidChrome from './app/FluidChrome'
import { matchRoute, type Route } from './app/router'
import { LEGACY_REDIRECTS } from './app/redirects'
import Dispatch from './pages/Dispatch'
import NewsArticle from './pages/NewsArticle'
import Blog from './pages/Blog'
import BlogPost from './pages/BlogPost'
import DataSources from './pages/DataSources'
import Datasets from './pages/Datasets'
import CountryProfile from './pages/CountryProfile'
import Trust from './pages/Trust'
import Legal from './pages/Legal'
import type { LegalDocId } from './content/legal'
import About from './pages/About'
import Faq from './pages/Faq'
import Methodology from './pages/Methodology'
import Glossary from './pages/Glossary'
import Learn from './pages/Learn'
import Lab from './pages/Lab'
import Research from './pages/Research'
import NotFound from './pages/NotFound'
import SiteChrome, { type ChromeVariant } from './app/SiteChrome'
import LoadingVeil from './components/LoadingVeil'

/**
 * RedirectShim — renders nothing and bounces to `to`. Used for every path in
 * `LEGACY_REDIRECTS` (see `./app/redirects` for what each one is and why).
 * `location.replace` (not `.href =`) so the dead URL never lands in browser
 * history and Back does not walk the visitor into it again.
 */
function RedirectShim({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to)
  }, [to])
  return null
}

/**
 * Insights is code-split because it pulls the dotted map, whose land-point
 * table alone is ~196 kB of source. Imported statically it lands in the entry
 * chunk and every visitor to the landing page pays for a map they never open
 * (measured: 333 kB → 588 kB raw on `dist/assets/index-*.js`).
 */
const Insights = lazy(() => import('./pages/Insights'))

/**
 * A route's `render` returns its element paired with a chrome variant
 * (PR-N1) instead of a bare `JSX.Element` — `router.ts` is generic over its
 * render's return type, so this rides the existing `matchRoute` mechanism
 * rather than needing a second lookup (`router.ts` is frozen — see its
 * header comment). `App()` reads `.chrome` to pick how `SiteChrome` wraps
 * `.element`.
 *
 *   'site'    → GlobalNav (default — every briefing/static/catalog page)
 *   'overlay' → GlobalNav, transparent-on-dark, no footer (/globe)
 *   'bare'    → no chrome at all (/design, /landing, /probe)
 */
interface RouteRender {
  element: JSX.Element
  chrome: ChromeVariant
}

/**
 * Route table for `matchRoute` (`./app/router`) — a ~40-line regex matcher,
 * not react-router-dom (not installed in this repo; adding one wasn't part
 * of the design-system porting brief). Matched in order; the first hit wins.
 * FluidChrome (and the AQI capsule it mounts) wraps only /globe, /today and
 * /insights — every other page (briefing surfaces and static content alike)
 * renders unwrapped, same as Home. /landing is deliberately excluded too
 * (P1 fix, 2026-09-05 audit): it is its own bare cinematic snapshot world
 * (LandingFlight owns its own chrome, per the 'bare' chrome variant below),
 * and the live capsule's real-time reading clashed with that world and
 * covered the Chapter 4 hero typography mid-scroll.
 *
 * Named export (not just used locally) so `nav.test.ts` can verify every
 * nav/footer href resolves here, and that no `chrome: 'site'` route is
 * missing from nav.
 */
// eslint-disable-next-line react-refresh/only-export-components -- route data, not a component
export const routes: Array<Route<RouteRender>> = [
  { path: '/design', render: () => ({ element: <DesignGallery />, chrome: 'bare' }) },
  { path: '/landing', render: () => ({ element: <LandingFlight />, chrome: 'bare' }) },
  // G2: Chapter 5's CTA now lands on the real observation deck (the WebGL
  // globe + its observatory chrome). GlobePlaceholder, which stood in while
  // the engine was unported, is retired — Globe falls back to GlobeFallback
  // itself when WebGL is unavailable.
  {
    path: '/globe',
    render: () => ({
      element: (
        <FluidChrome>
          <Globe />
        </FluidChrome>
      ),
      chrome: 'overlay',
    }),
  },
  // Legacy paths (`./app/redirects`) — `/weather` among them, absorbed into
  // /today by DECISIONS-2026-08-28 D4 (`Weather.tsx` itself was retired in
  // Wave 2A; `WeatherHero` and its Conditions-tab sections are Today's now,
  // sharing weather.css). All 'bare': the redirect is instant, so mounting nav
  // chrome would only flash it for one render before `location.replace` fires.
  // Spread before the page routes so the table stays readable, not because
  // order matters — every `from` is an exact path with no page counterpart,
  // which `App.test.tsx` asserts.
  ...LEGACY_REDIRECTS.map(({ from, to }) => ({
    path: from,
    render: () => ({ element: <RedirectShim to={to} />, chrome: 'bare' as ChromeVariant }),
  })),
  // Today's own hero (WeatherHero) is a temperature/sky reading, not an AQI
  // readout — its former always-visible PM2.5 HUD+Answer content moved into
  // the Insight tab (Weather Storyboard v3, Wave 2A), so wrapping in
  // FluidChrome no longer doubles up a floating AqiCapsule. Same
  // capsuleVariant="day" pattern as /insights, below.
  {
    path: '/today',
    render: () => ({
      element: (
        <FluidChrome capsuleVariant="day">
          <Today />
        </FluidChrome>
      ),
      chrome: 'site',
    }),
  },
  {
    path: '/insights',
    render: () => ({
      element: (
        <FluidChrome capsuleVariant="day">
          <Suspense fallback={<LoadingVeil label="INSIGHTS" />}>
            <Insights />
          </Suspense>
        </FluidChrome>
      ),
      chrome: 'site',
    }),
  },
  { path: '/probe', render: () => ({ element: <DataProbe />, chrome: 'bare' }) },
  { path: '/dispatch', render: () => ({ element: <Dispatch />, chrome: 'site' }) },
  { path: '/news/:slug', render: ({ slug }) => ({ element: <NewsArticle slug={slug} />, chrome: 'site' }) },
  { path: '/blog', render: () => ({ element: <Blog />, chrome: 'site' }) },
  { path: '/blog/:slug', render: ({ slug }) => ({ element: <BlogPost slug={slug} />, chrome: 'site' }) },
  { path: '/data-sources', render: () => ({ element: <DataSources />, chrome: 'site' }) },
  { path: '/datasets', render: () => ({ element: <Datasets />, chrome: 'site' }) },
  // CountryProfile normalizes `code` itself (trims + upper-cases), so the
  // raw decoded path segment is passed through as-is.
  {
    path: '/country/:code',
    render: ({ code }) => ({ element: <CountryProfile code={code} />, chrome: 'site' }),
  },
  { path: '/trust', render: () => ({ element: <Trust />, chrome: 'site' }) },
  // Legal falls back to its first document for an unrecognized `doc` id
  // rather than 404ing (Legal.tsx `LEGAL_DOCS.find(...) ?? LEGAL_DOCS[0]`).
  {
    path: '/legal/:doc',
    render: ({ doc }) => ({ element: <Legal doc={doc as LegalDocId} />, chrome: 'site' }),
  },
  { path: '/about', render: () => ({ element: <About />, chrome: 'site' }) },
  { path: '/faq', render: () => ({ element: <Faq />, chrome: 'site' }) },
  { path: '/methodology', render: () => ({ element: <Methodology />, chrome: 'site' }) },
  { path: '/glossary', render: () => ({ element: <Glossary />, chrome: 'site' }) },
  { path: '/learn', render: () => ({ element: <Learn />, chrome: 'site' }) },
  { path: '/lab', render: () => ({ element: <Lab />, chrome: 'site' }) },
  { path: '/research', render: () => ({ element: <Research />, chrome: 'site' }) },
  // Home (`/`) IS the briefing surface — it renders its own current-reading
  // hero, so it is not wrapped in FluidChrome (that would mount a second,
  // redundant AqiCapsule readout on top of it).
  { path: '/', render: () => ({ element: <Home />, chrome: 'site' }) },
]

function App() {
  // `window` guard mirrors the previous per-branch checks — if it's ever
  // unavailable, pathname defaults to '/' and the root route (Home) matches.
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  // Any path none of the routes above match falls to the recovery surface
  // (NotFound), replacing the previous silent fallback to Home. NotFound
  // still gets the site chrome (nav) — it's a recovery surface, not an exit.
  const matched = matchRoute(pathname, routes)
  const { element, chrome } = matched ?? { element: <NotFound />, chrome: 'site' as ChromeVariant }
  return <SiteChrome variant={chrome}>{element}</SiteChrome>
}

export default App
