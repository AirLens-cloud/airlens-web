/**
 * GlobeGridTooltip — pointer readout for the scalar-field grid cell under the
 * cursor. Adapted from AirLens-platform
 * `apps/web/src/components/globe/GlobeTooltip.tsx` (renamed to say which of the
 * three source tooltips this is), react-i18next stripped.
 *
 * A missing cell prints "Not measured" rather than 0 — an unmeasured cell and a
 * clean one are different facts.
 *
 * Not wrapped in `LiquidGlass` (unlike the legend and layer toggles): this
 * element mounts and unmounts on every hover, and LiquidGlass rebuilds a
 * displacement map per mount. It uses the same night-glass tokens in CSS
 * instead, so the material reads identically without the per-hover cost.
 */
import { useEffect, useState } from 'react'
import { useGlobeStore } from '../../../store/globeStore'
import { OVERLAY_DISPLAY_LABELS } from '../../../lib/config/globeOverlays'

function fmtCoord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`
}

export default function GlobeGridTooltip() {
  const gridHover = useGlobeStore((s) => s.gridHover)
  const hoveredStation = useGlobeStore((s) => s.hoveredStation)
  const hoveredPrediction = useGlobeStore((s) => s.hoveredPrediction)
  const overlayType = useGlobeStore((s) => s.overlayType)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMove = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('pointermove', handleMove, { passive: true })
    return () => window.removeEventListener('pointermove', handleMove)
  }, [])

  // Point markers own the cursor when one is hovered — two stacked readouts
  // for the same pixel is worse than one.
  if (!gridHover || hoveredStation || hoveredPrediction || overlayType === 'none') return null
  const info = OVERLAY_DISPLAY_LABELS[overlayType]
  if (!info) return null

  return (
    <div className="globe-grid-readout" style={{ left: pos.x + 16, top: pos.y - 8 }} aria-hidden="true">
      <div className="gr-name">{info.label}</div>
      <div className="gr-row">
        {gridHover.value != null ? (
          <>
            <span className="gr-value">{gridHover.value.toFixed(1)}</span>
            <span className="gr-unit">{info.unit}</span>
          </>
        ) : (
          <span className="gr-nodata">Not measured</span>
        )}
      </div>
      <div className="gr-coords">{fmtCoord(gridHover.lat, gridHover.lon)}</div>
    </div>
  )
}
