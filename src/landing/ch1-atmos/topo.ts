// Coastline arcs → globe-space segment endpoints for a THREE.lineSegments buffer.
// The TopoJSON decoding itself lives in shared/geo (a future PARTICULATE-style
// chapter would read the same file into its own lat/lon window), so only the
// globe mapping is chapter-specific here.
//
// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/topo.ts` (Wave L1, 2026-08-26).
import { latLonToGlobe } from './globeCoords'
import { objectLines } from '../shared/geo/topoLines'

export function coastlineSegments(topo: unknown, object = 'coastline_110m', r = 1.004): Float32Array {
  const out: number[] = []
  for (const line of objectLines(topo, object)) {
    for (let i = 0; i < line.length - 1; i++) {
      const [lo0, la0] = line[i]
      const [lo1, la1] = line[i + 1]
      const a = latLonToGlobe(la0, lo0, r)
      const b = latLonToGlobe(la1, lo1, r)
      out.push(a[0], a[1], a[2], b[0], b[1], b[2])
    }
  }
  return new Float32Array(out)
}
