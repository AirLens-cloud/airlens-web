import type { ReactNode } from 'react'
import AqiCapsule, { type AqiCapsuleProps } from '../components/fluid/capsule/AqiCapsule'

export interface FluidChromeProps {
  children: ReactNode
  /** Glass variant for the floating capsule. Defaults to 'night' — the
   * landing flight and Globe stay unchanged. /weather passes 'day' to
   * match its light sky-glass hero (position stays the site-standard
   * top-center float; this only changes the glass tint). */
  capsuleVariant?: AqiCapsuleProps['variant']
}

/**
 * FluidChrome — the global chrome layer for surfaces that opt in (the
 * landing flight, the Globe page, and /weather). Renders its children
 * untouched, then mounts the floating AQI capsule in a fixed top-center
 * overlay above them.
 */
export default function FluidChrome({ children, capsuleVariant }: FluidChromeProps): ReactNode {
  return (
    <>
      {children}
      <div className="fluid-chrome__overlay" data-testid="fluid-chrome-overlay">
        <AqiCapsule variant={capsuleVariant} />
      </div>
    </>
  )
}
