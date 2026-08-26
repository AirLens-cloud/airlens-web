// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/particulate/sections/Overlay.tsx` (Wave L2, 2026-08-26);
// `objectLines`/`LonLat` import rebound to this repo's `shared/geo/topoLines`
// (same module Ch1's `topo.ts` reads coastlines from — that module's own
// header comment already anticipated this: "PARTICULATE projects them into
// its own lat/lon window").
import { useMemo } from 'react'
import { objectLines, type LonLat } from '../../shared/geo/topoLines'
import type { Place, Window } from '../types'

// The field is beautiful and, on its own, unplaceable — a warm smear could be anywhere.
// These are the two hairlines that make it a map: the coastline under the air, and the
// city itself. Both are drawn from the same window as the shader, so they register.

const VB = 1000 // viewBox units; preserveAspectRatio="none" stretches to the window

/** Window lon/lat → viewBox coords. Returns null outside a generous margin. */
function project(lon: number, lat: number, win: Window): [number, number] {
  const x = ((lon - win.lon0) / win.lonSpan) * VB
  const y = (1 - (lat - win.lat0) / win.latSpan) * VB
  return [x, y]
}

/** Coastline polylines → SVG path, cut at the antimeridian and outside the window. */
function coastPath(lines: LonLat[][], win: Window): string {
  const parts: string[] = []
  const margin = VB * 0.15

  for (const line of lines) {
    let open = false
    let prevLon: number | null = null
    for (const [lon, lat] of line) {
      // Unwrap into the window's longitude frame (the window may straddle ±180).
      let lo = lon
      while (lo - win.lon0 > 180) lo -= 360
      while (lo - win.lon0 < -180) lo += 360

      const jumped = prevLon != null && Math.abs(lo - prevLon) > 90
      prevLon = lo

      const [x, y] = project(lo, lat, win)
      const inside = x > -margin && x < VB + margin && y > -margin && y < VB + margin
      if (!inside || jumped) {
        open = false
        continue
      }
      parts.push(`${open ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`)
      open = true
    }
  }
  return parts.join('')
}

export default function Overlay({
  topo,
  win,
  place,
  windU,
  windV,
}: {
  topo: unknown
  win: Window
  place: Place
  windU: number
  windV: number
}) {
  // Decode the topology once; a city switch only re-projects. Decoding per window
  // change cost 50-220 ms long-tasks on every chip click (measured).
  const lines = useMemo(() => objectLines(topo, 'coastline_110m'), [topo])
  const d = useMemo(() => coastPath(lines, win), [lines, win])
  const [cx, cy] = project(place.lon, place.lat, win)

  // Bearing the air is heading *toward*, clockwise from north (0° = up on screen).
  const heading = (Math.atan2(windU, windV) * 180) / Math.PI

  return (
    <div className="ch2-pt__overlay" aria-hidden="true">
      <svg className="ch2-pt__geo" viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="none">
        <path className="ch2-pt__coast" d={d} />
      </svg>

      <div className="ch2-pt__marker" style={{ left: `${(cx / VB) * 100}%`, top: `${(cy / VB) * 100}%` }}>
        <span className="ch2-pt__marker-ring" />
        <span className="ch2-pt__marker-label">{place.name.toUpperCase()}</span>
      </div>

      <div className="ch2-pt__wind">
        <svg viewBox="0 0 24 24" className="ch2-pt__wind-arrow" style={{ transform: `rotate(${heading}deg)` }}>
          <path d="M12 2 L12 22 M12 2 L7.5 8 M12 2 L16.5 8" />
        </svg>
        <span className="ch2-pt__wind-txt">
          {place.windSpeed.toFixed(1)} m/s · streak length follows speed
        </span>
      </div>
    </div>
  )
}
