/**
 * TodayHud — the top status strip on `/today`, matching the approved
 * mockup's "● TODAY · MODE NOW · PM2.5 · VALID {t} UTC · [NATURE] · {city}
 * · UPDATED {age}" band. Styled with the same `.gobs-hud` primitives
 * `GlobeObsHud` uses (composites.css, scoped under `.obs-surface`) rather
 * than reusing that component directly — Today needs a city name and an
 * "updated N ago" age GlobeObsHud's `AtmosphericMode`-shaped props don't
 * model, so this is a sibling component sharing only the CSS classes.
 */
import { formatElapsed } from '../../lib/home/whyNow'

export type TodayHudStatus = 'ready' | 'stale' | 'unavailable' | 'loading'

export interface TodayHudProps {
  status: TodayHudStatus
  city: string
  countryCode: string | null
  validTimeMs: number | null
  updatedAgeMs: number | null
  /** e.g. "[ANALYSIS]" / "[FORECAST]" / "[NO DATA]" — which source backs the primary reading. */
  natureLabel: string
}

function utcStamp(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${new Date(value).toISOString().replace('T', ' ').slice(0, 16)} UTC`
}

export default function TodayHud({ status, city, countryCode, validTimeMs, updatedAgeMs, natureLabel }: TodayHudProps) {
  return (
    <section className="gobs-hud m num" aria-label="Today status">
      <span className="gobs-identity">
        <i className={`gobs-live-dot is-${status}`} aria-hidden="true" />
        <span className="strong">TODAY</span>
      </span>
      <span className="gobs-primary">
        <span className="strong">MODE NOW · PM2.5</span>
      </span>
      <span className="gobs-contract">
        <b>{natureLabel}</b>
      </span>
      <span>
        VALID <span className="strong">{utcStamp(validTimeMs)}</span>
      </span>
      <span className="gobs-source">
        {city}
        {countryCode ? `, ${countryCode}` : ''}
      </span>
      {updatedAgeMs != null && <span className="dim">UPDATED {formatElapsed(updatedAgeMs)}</span>}
    </section>
  )
}
