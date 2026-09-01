import { DataProbe } from './pages/DataProbe'
import DesignGallery from './pages/DesignGallery'
import LandingFlight from './pages/LandingFlight'
import Globe from './pages/Globe'
import { Suspense, lazy, useEffect, type JSX } from 'react'
import Today from './pages/Today'
import Home from './pages/Home'
import FluidChrome from './app/FluidChrome'
import { matchRoute } from './app/router'
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

/**
 * WeatherRedirectShim — `/weather` no longer has its own page. Today absorbed
 * it (DECISIONS-2026-08-28 D4): the route now bounces to `/today` with its
 * Conditions tab pre-selected, so existing links/bookmarks keep working
 * instead of 404ing. `location.replace` (not `.href =`) so the old URL
 * never lands in browser history.
 */
function WeatherRedirectShim() {
  useEffect(() => {
    window.location.replace('/today?tab=conditions')
  }, [])
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
 * Route table for `matchRoute` (`./app/router`) — a ~40-line regex matcher,
 * not react-router-dom (not installed in this repo; adding one wasn't part
 * of the design-system porting brief). Matched in order; the first hit wins.
 * FluidChrome (and the AQI capsule it mounts) wraps only the immersive
 * surfaces — /landing, /globe, /insights — every other page (briefing
 * surfaces and static content alike) renders unwrapped, same as Home/Today.
 */
const routes: Array<{ path: string; render: (params: Record<string, string>) => JSX.Element }> = [
  { path: '/design', render: () => <DesignGallery /> },
  {
    path: '/landing',
    render: () => (
      <FluidChrome>
        <LandingFlight />
      </FluidChrome>
    ),
  },
  // G2: Chapter 5's CTA now lands on the real observation deck (the WebGL
  // globe + its observatory chrome). GlobePlaceholder, which stood in while
  // the engine was unported, is retired — Globe falls back to GlobeFallback
  // itself when WebGL is unavailable.
  {
    path: '/globe',
    render: () => (
      <FluidChrome>
        <Globe />
      </FluidChrome>
    ),
  },
  // /weather is absorbed into /today (DECISIONS-2026-08-28 D4) — this is now
  // a redirect shim, not a page render. `Weather.tsx` itself is untouched;
  // Today's Conditions tab reuses its section components directly.
  { path: '/weather', render: () => <WeatherRedirectShim /> },
  // Today IS the briefing/decision surface — it renders its own current-
  // reading HUD and Answer hero, so it is not wrapped in FluidChrome (that
  // would float a second, redundant AqiCapsule readout over it). Same
  // reasoning as Home, below.
  { path: '/today', render: () => <Today /> },
  {
    path: '/insights',
    render: () => (
      <FluidChrome capsuleVariant="day">
        <Suspense fallback={null}>
          <Insights />
        </Suspense>
      </FluidChrome>
    ),
  },
  { path: '/probe', render: () => <DataProbe /> },
  { path: '/dispatch', render: () => <Dispatch /> },
  { path: '/news/:slug', render: ({ slug }) => <NewsArticle slug={slug} /> },
  { path: '/blog', render: () => <Blog /> },
  { path: '/blog/:slug', render: ({ slug }) => <BlogPost slug={slug} /> },
  { path: '/data-sources', render: () => <DataSources /> },
  { path: '/datasets', render: () => <Datasets /> },
  // CountryProfile normalizes `code` itself (trims + upper-cases), so the
  // raw decoded path segment is passed through as-is.
  { path: '/country/:code', render: ({ code }) => <CountryProfile code={code} /> },
  { path: '/trust', render: () => <Trust /> },
  // Legal falls back to its first document for an unrecognized `doc` id
  // rather than 404ing (Legal.tsx `LEGAL_DOCS.find(...) ?? LEGAL_DOCS[0]`).
  { path: '/legal/:doc', render: ({ doc }) => <Legal doc={doc as LegalDocId} /> },
  { path: '/about', render: () => <About /> },
  { path: '/faq', render: () => <Faq /> },
  { path: '/methodology', render: () => <Methodology /> },
  { path: '/glossary', render: () => <Glossary /> },
  { path: '/learn', render: () => <Learn /> },
  { path: '/lab', render: () => <Lab /> },
  { path: '/research', render: () => <Research /> },
  // Home (`/`) IS the briefing surface — it renders its own current-reading
  // hero, so it is not wrapped in FluidChrome (that would mount a second,
  // redundant AqiCapsule readout on top of it).
  { path: '/', render: () => <Home /> },
]

function App() {
  // `window` guard mirrors the previous per-branch checks — if it's ever
  // unavailable, pathname defaults to '/' and the root route (Home) matches.
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  // Any path none of the routes above match falls to the recovery surface
  // (NotFound), replacing the previous silent fallback to Home.
  return matchRoute(pathname, routes) ?? <NotFound />
}

export default App
