/**
 * GlobeMapView — 2D equirectangular reading of the same grid payload the 3D
 * scene renders, with no `three` dependency. This is what mounts when WebGL2
 * is unavailable (the stage's primary fallback) or when a user picks Map by
 * hand — either way it must draw the real feed, not the decorative static
 * SVG `GlobeFallback` used to show in this slot (`GlobeFallback.tsx`'s own
 * header now calls out that its 9 marker dots are fixed coordinates,
 * "실 데이터 미소비").
 *
 * Plain SVG, not canvas: circles are focusable/clickable DOM nodes, so the
 * keyboard path (Tab, Enter) comes for free instead of needing a hit-test
 * layer on top of a raster.
 *
 * Country outlines reuse `useCountryFeatures()` — the exact GeoJSON the 3D
 * scene's `CountryExtrude`/`CountryClickHandler` already fetch once and
 * share, so the basemap under the grid is a real coastline, not decoration.
 *
 * Two-tier fallback (`globe-map-table-observatory-explore.md` §12): if the
 * grid artifact itself fails to load, this view degrades further to the
 * static `GlobeFallback` SVG plus an honest error banner, rather than
 * rendering an empty ocean and calling it a map.
 */
import { useMemo } from 'react'
import { useGlobeStore } from '../../../store/globeStore'
import { useGlobeGridSnapshot } from '../../../hooks/useGlobeData'
import { useCountryFeatures } from '../../../hooks/useCountryData'
import { gradeToHex } from '../../../lib/globe/gradeColor'
import { MAP_VIEW_W, MAP_VIEW_H, project, featurePath } from '../../../lib/globe/equirectProjection'
import GlobeFallback from '../GlobeFallback'
import type { GlobalGridCell } from '../../../types/data'

export default function GlobeMapView() {
  const snapshot = useGlobeGridSnapshot()
  const countries = useCountryFeatures()
  const selectedStation = useGlobeStore((s) => s.selectedStation)
  const setSelectedStation = useGlobeStore((s) => s.setSelectedStation)

  // No secondary cap here: `nearbyCells` (from `useGlobeGridSnapshot`) is
  // already bounded to a globe-spanning sample by `fetchGlobalGridSnapshot`'s
  // own limit (`api/gridSnapshot.ts`). A further `.slice(0, N)` prefix-cut on
  // top of that would re-introduce the same bias this view was fixed for —
  // an ordered sample's first N entries are not a second, independent random
  // sample of it. A few thousand static SVG circles renders fine.
  const withId = useMemo(
    () => (snapshot?.nearbyCells ?? []).map((cell, index) => ({ stationUid: `grid-${index + 1}`, cell })),
    [snapshot],
  )

  const coastlines = useMemo(() => {
    if (!countries) return []
    return countries.features.map((f, i) => ({ key: i, d: featurePath(f) })).filter((f) => f.d)
  }, [countries])

  const select = (stationUid: string, cell: GlobalGridCell) => {
    setSelectedStation({
      lat: cell.lat,
      lon: cell.lon,
      pm25: cell.pm25,
      dqss: cell.dqss,
      source: 'global_grid',
      station_uid: stationUid,
    })
  }

  if (!snapshot || withId.length === 0) {
    return (
      <div className="globe-map-view is-error">
        <GlobeFallback message="The live grid feed is unavailable, so the map cannot draw published cells right now." />
        <p className="gmv-error-banner" role="alert">Grid data failed to load — showing the static reference globe instead.</p>
      </div>
    )
  }

  return (
    <div className="globe-map-view">
      <svg
        className="gmv-svg"
        viewBox={`0 0 ${MAP_VIEW_W} ${MAP_VIEW_H}`}
        role="img"
        aria-label="2D equirectangular map of published PM2.5 grid cells"
      >
        <rect x={0} y={0} width={MAP_VIEW_W} height={MAP_VIEW_H} className="gmv-ocean" />
        {coastlines.map(({ key, d }) => (
          <path key={key} d={d} className="gmv-coast" />
        ))}
        {withId.map(({ stationUid, cell }) => {
          const { x, y } = project(cell.lat, cell.lon)
          const active = selectedStation?.station_uid === stationUid
          return (
            <circle
              key={stationUid}
              cx={x}
              cy={y}
              r={active ? 4.5 : 2.4}
              className={`gmv-dot${active ? ' is-selected' : ''}`}
              style={{ fill: gradeToHex(cell.grade) }}
              role="button"
              tabIndex={0}
              aria-label={`Grid cell ${cell.lat.toFixed(1)}, ${cell.lon.toFixed(1)} — PM2.5 ${cell.pm25.toFixed(1)} µg/m³`}
              aria-pressed={active}
              onClick={() => select(stationUid, cell)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                select(stationUid, cell)
              }}
            >
              <title>{`${cell.pm25.toFixed(1)} µg/m³ · ${cell.grade ?? '—'}`}</title>
            </circle>
          )
        })}
      </svg>
      {snapshot.stale && <p className="gmv-caveat m">FEED STALE — VALUES MAY NOT REFLECT CURRENT CONDITIONS</p>}
    </div>
  )
}
