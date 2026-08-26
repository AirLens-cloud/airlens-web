import type { MarkerData, GeoCluster } from "./types";

export function clusterByGeo(
  markers: MarkerData[],
  cellDeg: number,
  activeIds: Set<string>
): GeoCluster[] {
  const grid = new Map<string, GeoCluster>();

  for (const m of markers) {
    const col = Math.floor(m.longitude / cellDeg);
    const row = Math.floor(m.latitude / cellDeg);
    const key = `${col},${row}`;

    let cell = grid.get(key);
    if (!cell) {
      cell = {
        avgLng: 0,
        avgLat: 0,
        count: 0,
        markers: [],
        hasActive: false,
        activeCount: 0,
      };
      grid.set(key, cell);
    }
    cell.avgLng += m.longitude;
    cell.avgLat += m.latitude;
    cell.count++;
    cell.markers.push(m);
    if (activeIds.has(m.id)) {
      cell.hasActive = true;
      cell.activeCount++;
    }
  }

  const results: GeoCluster[] = [];
  for (const cell of grid.values()) {
    cell.avgLng /= cell.count;
    cell.avgLat /= cell.count;
    results.push(cell);
  }

  return results;
}
