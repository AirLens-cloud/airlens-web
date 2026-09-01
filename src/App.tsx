import { DataProbe } from './pages/DataProbe'
import DesignGallery from './pages/DesignGallery'
import LandingFlight from './pages/LandingFlight'
import Globe from './pages/Globe'
import { Suspense, lazy, useEffect } from 'react'
import Today from './pages/Today'
import Home from './pages/Home'
import FluidChrome from './app/FluidChrome'

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
 * Plain pathname branching — no react-router-dom dependency (not installed
 * in this repo; adding one wasn't part of the design-system porting brief).
 */
function App() {
  if (typeof window !== 'undefined' && window.location.pathname === '/design') {
    return <DesignGallery />
  }
  if (typeof window !== 'undefined' && window.location.pathname === '/landing') {
    return (
      <FluidChrome>
        <LandingFlight />
      </FluidChrome>
    )
  }
  // G2: Chapter 5's CTA now lands on the real observation deck (the WebGL
  // globe + its observatory chrome). GlobePlaceholder, which stood in while
  // the engine was unported, is retired — Globe falls back to GlobeFallback
  // itself when WebGL is unavailable.
  if (typeof window !== 'undefined' && window.location.pathname === '/globe') {
    return (
      <FluidChrome>
        <Globe />
      </FluidChrome>
    )
  }
  // /weather is absorbed into /today (DECISIONS-2026-08-28 D4) — this is now
  // a redirect shim, not a page render. `Weather.tsx` itself is untouched;
  // Today's Conditions tab reuses its section components directly.
  if (typeof window !== 'undefined' && window.location.pathname === '/weather') {
    return <WeatherRedirectShim />
  }
  // Today IS the briefing/decision surface — it renders its own current-
  // reading HUD and Answer hero, so it is not wrapped in FluidChrome (that
  // would float a second, redundant AqiCapsule readout over it). Same
  // reasoning as Home, below.
  if (typeof window !== 'undefined' && window.location.pathname === '/today') {
    return <Today />
  }
  if (typeof window !== 'undefined' && window.location.pathname === '/insights') {
    return (
      <FluidChrome capsuleVariant="day">
        <Suspense fallback={null}>
          <Insights />
        </Suspense>
      </FluidChrome>
    )
  }
  if (typeof window !== 'undefined' && window.location.pathname === '/probe') {
    return <DataProbe />
  }
  // Home (`/`) IS the briefing surface — it renders its own current-reading
  // hero, so it is not wrapped in FluidChrome (that would mount a second,
  // redundant AqiCapsule readout on top of it). Any other unmatched path
  // falls back to Home too, same as DataProbe did before this route moved.
  return <Home />
}

export default App
