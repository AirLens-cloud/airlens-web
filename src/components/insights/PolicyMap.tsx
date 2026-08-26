/**
 * PolicyMap — band 3. The selected country's region, coloured by observed
 * annual PM2.5 for one year, with the year scrubbable.
 *
 * The map is an OBSERVATION surface, not a model output: what it colours is the
 * published annual mean per country, interpolated between anchor points for
 * legibility. It carries no ATT and no uncertainty, and the caption says which
 * feeds produced the numbers.
 *
 * Hover copy lives here rather than in DottedMap because this page owns the
 * meaning of the number. `null` from `findPanelObservation` is "not observed
 * this year" — rendered as exactly that, never as zero.
 */
import { useMemo, useState } from 'react'
import { DottedMap } from '../dotted-map'
import type { MarkerCluster, MarkerData, ViewMode } from '../dotted-map/types'
import { COUNTRY_CENTERS } from '../../lib/config/countryCenters'
import { buildYearStations, panelYears } from '../../lib/insights/mapStations'
import { findPanelObservation } from '../../lib/insights/calculations'
import type { CountryPanel } from '../../types/policy'

export interface PolicyMapProps {
  panels: CountryPanel[]
  selectedCode: string
  selectedName: string
  regionName: string | null
  /** Year the map opens on — the treatment year when there is one. */
  focusYear: number | null
  /** Region peers with no coordinate in COUNTRY_CENTERS — reported, not hidden. */
  peersWithoutAnchor: string[]
  peersOmitted: number
  /** Peers whose read failed — absent because unreadable, not because unmeasured. */
  peersUnreadable: number
  unit?: string
}

export default function PolicyMap({
  panels,
  selectedCode,
  selectedName,
  regionName,
  focusYear,
  peersWithoutAnchor,
  peersOmitted,
  peersUnreadable,
  unit = 'µg/m³',
}: PolicyMapProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('flat')
  const [hovered, setHovered] = useState<MarkerCluster | null>(null)

  const years = useMemo(() => panelYears(panels), [panels])

  // The scrubber is uncontrolled after first paint; `year` falls back to the
  // treatment year, then to the latest observed year, so it never lands on a
  // year with nothing in it.
  const [pickedYear, setPickedYear] = useState<number | null>(null)
  const year = useMemo(() => {
    if (pickedYear !== null && years.includes(pickedYear)) return pickedYear
    if (focusYear !== null && years.includes(focusYear)) return focusYear
    return years.length > 0 ? years[years.length - 1] : null
  }, [pickedYear, focusYear, years])

  const yearStations = useMemo(
    () => (year === null ? null : buildYearStations(panels, year)),
    [panels, year],
  )

  const markers = useMemo<MarkerData[]>(() => {
    const center = COUNTRY_CENTERS[selectedCode]
    if (!center) return []
    return [{ id: selectedCode, latitude: center[0], longitude: center[1] }]
  }, [selectedCode])

  const hoveredReadout = useMemo(() => {
    if (!hovered || year === null) return null
    // The pointer can still hold the previous country's marker when the
    // selection changes (no mousemove fires, so no leave event). Suppress
    // rather than relabel — the held screen position belongs to the old anchor.
    if (hovered.markers[0]?.id?.toUpperCase() !== selectedCode) return null
    return { pm25: findPanelObservation(panels, selectedCode, year), year }
  }, [hovered, year, panels, selectedCode])

  const noCoverage = yearStations !== null && yearStations.stations.length === 0

  return (
    <section className="ins-map-band" aria-labelledby="ins-map-title">
      <div className="ins-map-head">
        <h2 id="ins-map-title" className="ins-band-title">
          Observed PM2.5{regionName ? ` — ${regionName}` : ''}
        </h2>
        <div className="ins-map-controls">
          <label className="m ins-year-label">
            YEAR
            <select
              className="ins-year-select num"
              value={year ?? ''}
              onChange={(e) => setPickedYear(Number(e.target.value))}
              disabled={years.length === 0}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ins-view-toggle m"
            onClick={() => setViewMode((m) => (m === 'flat' ? 'globe' : 'flat'))}
            aria-pressed={viewMode === 'globe'}
          >
            {viewMode === 'flat' ? '2D PROJECTION' : '3D GLOBE'}
          </button>
        </div>
      </div>

      <div className="ins-map-frame">
        <DottedMap
          markers={markers}
          stationData={yearStations?.stations ?? []}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          activeMarkerIds={[selectedCode]}
          selectedCountryName={selectedName}
          darkMode
          autoRotate={false}
          className="ins-map-canvas"
          ariaLabel="Regional PM2.5 map — arrow keys pan, plus and minus zoom, 0 resets"
          onHoverMarker={setHovered}
        />

        {hovered && hoveredReadout ? (
          <div
            className="ins-map-tooltip"
            role="status"
            style={{ left: hovered.x, top: hovered.y - hovered.radius }}
          >
            <span className="ins-map-tooltip-name">{selectedName}</span>
            <span className="ins-map-tooltip-val num">
              {hoveredReadout.pm25 === null
                ? `${hoveredReadout.year} — not observed`
                : `${hoveredReadout.year} annual mean ${hoveredReadout.pm25.toFixed(1)} ${unit}`}
            </span>
          </div>
        ) : null}

        {noCoverage ? (
          <p className="ins-map-overlay-empty" role="status">
            No country in this region has an observation published for {year}.
            The map is empty because the data is, not because it failed to load.
          </p>
        ) : null}
      </div>

      <p className="ins-note">
        Each dot is coloured by the nearest countries' published annual mean,
        anchored at capital-city coordinates — the shading between anchors is
        interpolation for legibility, not measurement.
        {yearStations && yearStations.sources.length > 0
          ? ` Sources for ${year}: ${yearStations.sources.join(', ')}.`
          : ''}
        {yearStations && yearStations.droppedNoObservation.length > 0
          ? ` ${yearStations.droppedNoObservation.length} countries in this region have no ${year} observation.`
          : ''}
        {peersWithoutAnchor.length > 0
          ? ` ${peersWithoutAnchor.length} more (${peersWithoutAnchor.join(', ')}) have no map coordinate in this build and are absent from the map entirely.`
          : ''}
        {peersOmitted > 0 ? ` ${peersOmitted} further peers were not requested.` : ''}
        {peersUnreadable > 0
          ? ` ${peersUnreadable} more could not be read — their panels may exist; this map simply failed to fetch them.`
          : ''}
      </p>
    </section>
  )
}
