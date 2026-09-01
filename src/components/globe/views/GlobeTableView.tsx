/**
 * GlobeTableView — exact-value, accessible reading of the same grid payload
 * the 3D scene and the Map view render. Table's job in the 3-view contract
 * (`globe-map-table-observatory-explore.md` §1): exact value + accessibility,
 * never a second opinion on the data.
 *
 * Row identity mirrors `api/globeMarkers.ts`'s `grid-${index+1}` scheme
 * exactly (same source array, same no-origin ranking, so the same index
 * means the same cell) — clicking a row writes the same `SelectedStation`
 * shape the 3D scene's `StationLabels` click handler does, so Evidence Rail
 * reacts identically regardless of which view picked the mark.
 *
 * Glass-box: the grid artifact carries no p10/p90 band (`api/gridSnapshot.ts`
 * doc comment) — the column says so rather than inventing one. DQSS is only
 * ever what the artifact itself published per cell; absent stays absent.
 */
import { useMemo } from 'react'
import { useGlobeStore } from '../../../store/globeStore'
import { useGlobeGridSnapshot } from '../../../hooks/useGlobeData'
import { useCountryFeatures } from '../../../hooks/useCountryData'
import { nearestPlaceFor } from '../../../lib/globe/nearestPlace'
import { dqssScoreToGrade } from '../../../lib/config/globeOntology'
import type { GlobalGridCell } from '../../../types/data'

/** The table shows the most concentrated cells first — beyond this it's a data dump, not a reading surface. */
const ROW_LIMIT = 200

interface TableRow {
  stationUid: string
  cell: GlobalGridCell
}

function fmtCoord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`
}

export default function GlobeTableView() {
  const snapshot = useGlobeGridSnapshot()
  const countries = useCountryFeatures()
  const selectedStation = useGlobeStore((s) => s.selectedStation)
  const setSelectedStation = useGlobeStore((s) => s.setSelectedStation)

  const rows = useMemo<TableRow[]>(() => {
    const cells = snapshot?.nearbyCells ?? []
    // Identity is assigned from the artifact's own order — sorting for
    // display must not renumber a cell, or row clicks would select the wrong
    // mark on the 3D scene.
    const withId = cells.map((cell, index) => ({ stationUid: `grid-${index + 1}`, cell }))
    return [...withId].sort((a, b) => b.cell.pm25 - a.cell.pm25).slice(0, ROW_LIMIT)
  }, [snapshot])

  if (!snapshot || rows.length === 0) {
    return (
      <div className="globe-table-view is-empty">
        <p className="atmos-honest-empty">
          {snapshot ? 'No published grid cells to show.' : 'Grid snapshot unavailable — showing no rows rather than a guess.'}
        </p>
      </div>
    )
  }

  return (
    <div className="globe-table-view">
      <table className="gtv-table">
        <caption className="gtv-caption">Published PM2.5 grid cells, sorted by concentration</caption>
        <thead>
          <tr>
            <th scope="col">Cell</th>
            <th scope="col">Nearest place</th>
            <th scope="col">PM2.5</th>
            <th scope="col">p10–p90</th>
            <th scope="col">Nature</th>
            <th scope="col">DQSS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ stationUid, cell }) => {
            const active = selectedStation?.station_uid === stationUid
            const place = nearestPlaceFor(cell.lat, cell.lon, countries)
            const grade = dqssScoreToGrade(cell.dqss)
            return (
              <tr
                key={stationUid}
                className={active ? 'is-selected' : undefined}
                aria-selected={active}
                tabIndex={0}
                onClick={() => setSelectedStation({
                  lat: cell.lat,
                  lon: cell.lon,
                  pm25: cell.pm25,
                  name: place ?? undefined,
                  dqss: cell.dqss,
                  source: 'global_grid',
                  station_uid: stationUid,
                })}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  setSelectedStation({
                    lat: cell.lat,
                    lon: cell.lon,
                    pm25: cell.pm25,
                    name: place ?? undefined,
                    dqss: cell.dqss,
                    source: 'global_grid',
                    station_uid: stationUid,
                  })
                }}
              >
                <td className="gtv-cell-coord">{fmtCoord(cell.lat, cell.lon)}</td>
                <td>{place ?? '—'}</td>
                <td className="gtv-pm25"><strong>{cell.pm25.toFixed(1)}</strong> µg/m³</td>
                <td className="gtv-dim">not published</td>
                <td className="gtv-dim">interpolated</td>
                <td>{grade ?? <span className="gtv-dim">not published</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="gtv-footer m">ROWS = PUBLISHED GRID CELLS ONLY — NO INTERPOLATION BEYOND THE FEED</p>
    </div>
  )
}
