import type { ReactNode } from 'react'
import AqiCapsule from '../components/fluid/capsule/AqiCapsule'

export interface FluidChromeProps {
  children: ReactNode
}

/**
 * FluidChrome — the global chrome layer for surfaces that opt in (the
 * landing flight and the Globe page). Renders its children untouched, then
 * mounts the floating AQI capsule in a fixed top-center overlay above them.
 */
export default function FluidChrome({ children }: FluidChromeProps): ReactNode {
  return (
    <>
      {children}
      <div className="fluid-chrome__overlay" data-testid="fluid-chrome-overlay">
        <AqiCapsule />
      </div>
    </>
  )
}
