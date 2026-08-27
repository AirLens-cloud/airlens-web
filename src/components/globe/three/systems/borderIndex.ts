/**
 * borderIndex — index-buffer suppression for the country-border line pass.
 *
 * CoastlineOutlines draws every country border as one LineSegments buffer at
 * BORDER_R (1.006). When a country is selected, CountryExtrude draws that same
 * perimeter as a cyan fat line at EDGE_R (1.016) — the 0.01 radial gap reads as
 * a doubled border near the globe limb (parallax at glancing angles). Instead
 * of rebuilding positions, the border geometry is built ONCE and only its index
 * buffer is rewritten to skip the selected feature's vertex range.
 */

export interface BorderFeatureRange {
  /** `properties.name` of the country feature ('' when absent). */
  name: string;
  /** Stringified topojson feature id (numeric ISO code). */
  id: string;
  /** First vertex of this feature's segments in the position buffer. */
  start: number;
  /** Number of vertices this feature contributes. */
  count: number;
}

/** Selection identity — same predicate as CountryExtrude's feature lookup. */
export function findSelectedRange(
  ranges: readonly BorderFeatureRange[],
  selected: { name: string; code: string } | null,
): BorderFeatureRange | null {
  if (!selected) return null;
  return ranges.find((r) => r.name === selected.name || r.id === selected.code) ?? null;
}

/**
 * Full pass-through index over `vertexCount` vertices, minus the excluded
 * feature's contiguous range. LineSegments pairs are preserved because every
 * feature contributes an even vertex count and ranges never interleave.
 */
export function buildBorderIndex(
  vertexCount: number,
  excluded: Pick<BorderFeatureRange, 'start' | 'count'> | null,
): Uint32Array {
  const excludedCount = excluded ? excluded.count : 0;
  const index = new Uint32Array(Math.max(0, vertexCount - excludedCount));
  let write = 0;
  for (let v = 0; v < vertexCount; v++) {
    if (excluded && v >= excluded.start && v < excluded.start + excluded.count) continue;
    index[write++] = v;
  }
  return index;
}
