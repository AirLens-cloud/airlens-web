/**
 * LiveBadge — age-derived LIVE/SNAPSHOT stamp.
 * Ported from AirLens-platform apps/web/src/components/wireframe/LiveBadge.tsx
 * with react-i18next stripped — labels are plain-English defaults, overridable
 * via props (this repo has no i18n yet; same shape as `t(key, fallback)` so
 * wiring real i18n back in later is a prop swap, not a rewrite).
 *
 * LIVE means what it says: the source timestamp is younger than 2x its
 * declared refresh cadence. Anything older, or a source with no parseable
 * cadence, renders as SNAPSHOT — with the measured age when known, without one
 * when not (never fabricates an age from an unknown timestamp).
 */

export interface LiveBadgeProps {
  /** Epoch ms of the data's own generation time — null when unknown. */
  timestampMs: number | null
  /** Expected refresh interval in ms. LIVE threshold = 2x cadence. Null = cadence undeclared -> never LIVE. */
  cadenceMs: number | null
  /** Injectable clock for tests — defaults to `Date.now()`. */
  nowMs?: number
  liveLabel?: string
  snapshotLabel?: string
}

function formatAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000)
  if (minutes < 60) return `${Math.max(minutes, 0)}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export default function LiveBadge({
  timestampMs,
  cadenceMs,
  nowMs,
  liveLabel = 'LIVE',
  snapshotLabel = 'SNAPSHOT',
}: LiveBadgeProps) {
  // eslint-disable-next-line react-hooks/purity -- Date.now() acceptable for display-only relative age label
  const now = nowMs ?? Date.now()
  const ageMs = timestampMs !== null ? Math.max(0, now - timestampMs) : null
  const isLive = ageMs !== null && cadenceMs !== null && ageMs < cadenceMs * 2

  if (isLive) {
    return (
      <span className="live-badge live-badge--live">
        <span className="live-badge__dot" aria-hidden="true" />
        <span className="live-badge__label t-micro">{liveLabel}</span>
      </span>
    )
  }

  return (
    <span className="live-badge live-badge--snapshot">
      <span className="live-badge__label t-micro">
        {ageMs !== null ? `${snapshotLabel} · ${formatAge(ageMs)}` : snapshotLabel}
      </span>
    </span>
  )
}
