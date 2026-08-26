// Minimal TopoJSON reader (no topojson dependency). `earth-topo.json` is a quantized
// Topology whose arcs are delta-encoded; both concepts that draw coastlines start here.
// ATMOS lifts these to globe space, PARTICULATE projects them into its lat/lon window.
//
// Ported verbatim from AirLens-platform apps/landing-lab
// `src/shared/geo/topoLines.ts` (Wave L0, 2026-08-26).

export interface Topology {
  transform: { scale: [number, number]; translate: [number, number] }
  arcs: Array<Array<[number, number]>>
  objects: Record<string, { geometries: Array<{ type: string; arcs: unknown }> }>
}

export type LonLat = [number, number]

/** Delta-decode every arc once into absolute [lon, lat]. */
export function decodeArcs(topo: unknown): LonLat[][] | null {
  const t = topo as Topology
  if (!t?.transform || !Array.isArray(t.arcs)) return null
  const [sx, sy] = t.transform.scale
  const [tx, ty] = t.transform.translate
  return t.arcs.map((arc) => {
    let x = 0
    let y = 0
    return arc.map(([dx, dy]) => {
      x += dx
      y += dy
      return [x * sx + tx, y * sy + ty] as LonLat
    })
  })
}

/** One object's LineStrings as polylines of [lon, lat]. */
export function objectLines(topo: unknown, object: string): LonLat[][] {
  const t = topo as Topology
  const arcs = decodeArcs(topo)
  if (!arcs || !t.objects?.[object]) return []

  const resolve = (idx: number): LonLat[] => {
    const pts = arcs[idx < 0 ? ~idx : idx]
    if (!pts) return []
    return idx < 0 ? pts.slice().reverse() : pts
  }

  const lines: LonLat[][] = []
  for (const g of t.objects[object].geometries) {
    if (g.type === 'LineString') {
      const line: LonLat[] = []
      for (const idx of g.arcs as number[]) line.push(...resolve(idx))
      if (line.length > 1) lines.push(line)
    } else if (g.type === 'MultiLineString') {
      for (const part of g.arcs as number[][]) {
        const line: LonLat[] = []
        for (const idx of part) line.push(...resolve(idx))
        if (line.length > 1) lines.push(line)
      }
    }
  }
  return lines
}
