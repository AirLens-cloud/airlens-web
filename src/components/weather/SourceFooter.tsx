import type { GeoSource } from '../../hooks/useGeolocation'

export interface SourceFooterProps {
  fetchedAt: number | null
  locationSource: GeoSource
}

function formatFetchedAt(ts: number | null): string {
  if (ts === null) return 'not yet fetched'
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return 'unknown'
  }
}

/**
 * SourceFooter — S6. Names the data sources, the real fetch timestamp (not a
 * static "last updated" copy line), and discloses how location is chosen —
 * opt-in geolocation, Seoul default on denial, coordinates never persisted
 * server-side (only the last chosen location, in this browser's localStorage).
 */
export default function SourceFooter({ fetchedAt, locationSource }: SourceFooterProps) {
  return (
    <footer className="wx-footer" aria-label="Data sources">
      <span className="wx-footer__line">SOURCE — Open-Meteo, via the AirLens community proxy (30-min cache)</span>
      <span className="wx-footer__line">FETCHED — {formatFetchedAt(fetchedAt)}</span>
      <span className="wx-footer__line">
        {locationSource === 'user'
          ? 'Location is only used to fetch this forecast — coordinates are not stored on any server.'
          : 'Location access is opt-in. Without permission, this page shows Seoul as a default — no coordinates are collected or stored.'}
      </span>
    </footer>
  )
}
