import { DataProbe } from './pages/DataProbe'
import DesignGallery from './pages/DesignGallery'
import LandingFlight from './pages/LandingFlight'
import Globe from './pages/Globe'
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
  if (typeof window !== 'undefined' && window.location.pathname === '/weather') {
    return (
      <FluidChrome capsuleVariant="day">
        <Weather />
      </FluidChrome>
    )
  }
  return <DataProbe />
}

export default App
