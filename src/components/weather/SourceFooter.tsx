import type { LocationSource } from '../../lib/location/resolveLocation'
import { PRIMARY_READING_SOURCES } from '../../lib/reading/readingCopy'

export interface SourceFooterProps {
  fetchedAt: number | null
  /** `null` while the location is still resolving — the disclosure line is omitted. */
  locationSource: LocationSource | null
}

function formatFetchedAt(ts: number | null): string {
  if (ts === null) return 'not yet fetched'
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return 'unknown'
  }
}

const LOCATION_DISCLOSURE: Record<LocationSource, string> = {
  geolocation:
    'Location access is opt-in. Your device location is used only to fetch this forecast, for this browser session — it is never stored.',
  search:
    'The city you chose is remembered in this browser only (localStorage) — it is never sent to a server.',
  approx:
    'Location access is opt-in. Until you grant it, this page starts from an IP-based approximate location — the edge network resolving a rough area from your connection and handing it back to your browser, never logged or stored — with Seoul as the fallback if that lookup fails too.',
  default:
    'Location access is opt-in. Seoul is shown because no location was chosen and the approximate lookup was unavailable — no coordinates are collected or stored.',
}

/**
 * SourceFooter — S6. Names the data sources — weather and PM2.5 separately,
 * since the Air quality line reads the shared primary reading, not the
 * weather proxy (W1b commit ③) — the weather fetch's real timestamp (not a
 * static "last updated" copy line), and discloses how location is chosen —
 * opt-in geolocation, an IP-approximate location before that opt-in, Seoul
 * as the final fallback, coordinates never persisted server-side (only the
 * last chosen location, in this browser's localStorage).
 */
export default function SourceFooter({ fetchedAt, locationSource }: SourceFooterProps) {
  return (
    <footer className="wx-footer" aria-label="Data sources">
      <span className="wx-footer__line">WEATHER — Open-Meteo, via the AirLens community proxy (30-min cache)</span>
      <span className="wx-footer__line">PM2.5 — {PRIMARY_READING_SOURCES}</span>
      <span className="wx-footer__line">WEATHER FETCHED — {formatFetchedAt(fetchedAt)}</span>
      {locationSource && <span className="wx-footer__line">{LOCATION_DISCLOSURE[locationSource]}</span>}
    </footer>
  )
}
