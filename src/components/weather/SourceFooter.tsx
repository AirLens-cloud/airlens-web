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

const LOCATION_DISCLOSURE: Record<GeoSource, string> = {
  user: 'Location is only used to fetch this forecast — coordinates are not stored on any server.',
  approx:
    'Location access is opt-in. Until you grant it, this page starts from an IP-based approximate location — the edge network resolving a rough area from your connection and handing it back to your browser, never logged or stored — with Seoul as the fallback if that lookup fails too.',
  default:
    'Location access is opt-in. Without permission, this page shows Seoul as a default — no coordinates are collected or stored.',
}

/**
 * SourceFooter — S6. Names the data sources, the real fetch timestamp (not a
 * static "last updated" copy line), and discloses how location is chosen —
 * opt-in geolocation, an IP-approximate location before that opt-in, Seoul
 * as the final fallback, coordinates never persisted server-side (only the
 * last chosen location, in this browser's localStorage).
 */
export default function SourceFooter({ fetchedAt, locationSource }: SourceFooterProps) {
  return (
    <footer className="wx-footer" aria-label="Data sources">
      <span className="wx-footer__line">SOURCE — Open-Meteo, via the AirLens community proxy (30-min cache)</span>
      <span className="wx-footer__line">FETCHED — {formatFetchedAt(fetchedAt)}</span>
      <span className="wx-footer__line">{LOCATION_DISCLOSURE[locationSource]}</span>
    </footer>
  )
}
