import { DataProbe } from './pages/DataProbe'
import DesignGallery from './pages/DesignGallery'
import LandingFlight from './pages/LandingFlight'

/**
 * Plain pathname branching — no react-router-dom dependency (not installed
 * in this repo; adding one wasn't part of the design-system porting brief).
 */
function App() {
  if (typeof window !== 'undefined' && window.location.pathname === '/design') {
    return <DesignGallery />
  }
  if (typeof window !== 'undefined' && window.location.pathname === '/landing') {
    return <LandingFlight />
  }
  return <DataProbe />
}

export default App
