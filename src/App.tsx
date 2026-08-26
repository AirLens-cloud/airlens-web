import { DataProbe } from './pages/DataProbe'
import DesignGallery from './pages/DesignGallery'
import LandingFlight from './pages/LandingFlight'
import GlobePlaceholder from './pages/GlobePlaceholder'
import Weather from './pages/Weather'
import FluidChrome from './app/FluidChrome'

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
  // Wave L4: Chapter 5's CTA links here — a real, honest landing spot
  // (GlobeFallback + snapshot caveat) rather than a dead href.
  if (typeof window !== 'undefined' && window.location.pathname === '/globe') {
    return (
      <FluidChrome>
        <GlobePlaceholder />
      </FluidChrome>
    )
  }
  if (typeof window !== 'undefined' && window.location.pathname === '/weather') {
    return <Weather />
  }
  return <DataProbe />
}

export default App
