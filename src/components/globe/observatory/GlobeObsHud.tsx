/**
 * GlobeObsHud — compact, truth-only status strip shared by every atmospheric
 * mode. Ported from AirLens-platform apps/web/src/components/globe/observatory/GlobeObsHud.tsx
 * as a fully presentational component: the source pulled its fields from
 * `useAtmosphericViewModel()` (a Globe-engine hook); this port takes the same
 * fields as props instead, so it renders with no Globe engine/store present.
 * react-i18next stripped — plain-English default props.
 */
import type { AtmosphericMode } from '../../../types/globe'

export type GlobeObsHudStatus = 'ready' | 'stale' | 'unavailable' | 'loading'
/**
 * The domain union, not a local copy: the deck's fifth lens is POLICY, and an
 * invented `'field'` member let a caller pass a mode the rest of the surface
 * cannot produce.
 */
export type GlobeObsHudMode = AtmosphericMode

export interface GlobeObsHudProps {
  status: GlobeObsHudStatus
  label: string
  unit?: string | null
  /** [low, high] of the rendered field range, if applicable. */
  range?: [number, number] | null
  leadHours?: number | null
  nature: string
  motion: string
  source?: string | null
  /** Epoch ms. */
  validTime?: number | null
  mode: GlobeObsHudMode
  deckLabel?: string
  ariaLabel?: string
  forecastCaveat?: string
}

function utcStamp(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${new Date(value).toISOString().replace('T', ' ').slice(0, 16)} UTC`
}

export default function GlobeObsHud({
  status,
  label,
  unit,
  range,
  leadHours,
  nature,
  motion,
  source,
  validTime,
  mode,
  deckLabel = 'ATMOSPHERIC OBSERVATORY',
  ariaLabel = 'Observation deck status',
  forecastCaveat = 'GEFS single-member forecast — no uncertainty band',
}: GlobeObsHudProps) {
  const rangeLabel = range ? `${range[0].toFixed(1)}–${range[1].toFixed(1)}` : null

  return (
    <section className="gobs-hud m num" aria-label={ariaLabel}>
      <span className="gobs-identity">
        <i className={`gobs-live-dot is-${status}`} aria-hidden="true" />
        <span className="strong">{deckLabel}</span>
      </span>
      <span className="gobs-primary">
        <span className="strong">{label}{unit ? ` · ${unit}` : ''}</span>
        {rangeLabel ? <> · <span className="tick">{rangeLabel}</span></> : null}
        {leadHours != null ? <> · <span className="tick">+{leadHours}H</span></> : null}
      </span>
      <span className="gobs-contract">
        <b>{nature}</b><i aria-hidden="true">/</i><b>{motion}</b>
      </span>
      <span className="gobs-source">SRC <strong>{source ?? '—'}</strong></span>
      {validTime != null && (
        <span>VALID <span className="strong">{utcStamp(validTime)}</span></span>
      )}
      {mode === 'forecast' && <span className="dim">{forecastCaveat}</span>}
    </section>
  )
}
