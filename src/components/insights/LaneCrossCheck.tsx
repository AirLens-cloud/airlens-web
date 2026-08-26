/**
 * LaneCrossCheck — band 2a. The same causal design, re-run on independent
 * inputs, shown side by side with the headline.
 *
 * This is the part of the 2026-08-26 re-estimation that has no equivalent in
 * the monorepo: three lanes (the ACAG ground-calibrated panel that produces the
 * headline, CAMS EAC4 reanalysis, and raw ground stations) each estimate the
 * same country independently. Agreement across lanes is the strongest honest
 * claim this pipeline can make; disagreement is worth more than a single
 * confident number, so both are rendered plainly.
 *
 * A lane with `att: null` declined to estimate. That is drawn as a stated
 * reason, never as a zero and never as a missing row — a lane silently omitted
 * would make a one-lane result look like a consensus.
 */
import { attGateReason } from '../../api/policy'
import { formatAtt, formatP } from '../../lib/insights/format'
import type { CrossCheckLane, PolicyImpact } from '../../types/policy'

export interface LaneCrossCheckProps {
  impact: PolicyImpact | null
  unit?: string
}

interface LaneRow {
  key: string
  label: string
  detail: string
  lane: CrossCheckLane
}

/** Sign agreement only — two lanes can agree on direction and differ on size. */
function directionOf(att: number | null): 'down' | 'up' | null {
  if (att === null || !Number.isFinite(att)) return null
  if (att === 0) return null
  return att < 0 ? 'down' : 'up'
}

function verdict(rows: LaneRow[], headline: number | null): string {
  const dirs = [directionOf(headline), ...rows.map((r) => directionOf(r.lane.att))].filter(
    (d): d is 'down' | 'up' => d !== null,
  )
  if (dirs.length < 2) {
    return 'Only one lane produced an estimate, so there is nothing to cross-check against. Treat the headline as unreplicated.'
  }
  const allSame = dirs.every((d) => d === dirs[0])
  return allSame
    ? `All ${dirs.length} lanes that produced an estimate agree on the direction (${dirs[0] === 'down' ? 'a fall' : 'a rise'} in PM2.5). They do not necessarily agree on the size.`
    : 'The lanes disagree on direction. The headline should not be read as a settled result.'
}

export default function LaneCrossCheck({ impact, unit = 'µg/m³' }: LaneCrossCheckProps) {
  const cross = impact?.crossCheck

  const rows: LaneRow[] = []
  if (cross?.cams_eac4) {
    rows.push({
      key: 'cams_eac4',
      label: 'CAMS EAC4',
      detail: 'ECMWF atmospheric reanalysis — model-assimilated, independent of the ground network.',
      lane: cross.cams_eac4,
    })
  }
  if (cross?.ground_stations) {
    rows.push({
      key: 'ground_stations',
      label: 'GROUND STATIONS',
      detail: 'Reference-grade monitors only — sparse coverage, no satellite input.',
      lane: cross.ground_stations,
    })
  }

  if (rows.length === 0) {
    return (
      <section className="ins-lanes" aria-labelledby="ins-lanes-title">
        <h2 id="ins-lanes-title" className="ins-band-title">Cross-check</h2>
        <p className="ins-empty">
          No independent re-estimation was published for this country, so the
          headline stands on one panel alone.
        </p>
      </section>
    )
  }

  return (
    <section className="ins-lanes" aria-labelledby="ins-lanes-title">
      <h2 id="ins-lanes-title" className="ins-band-title">Cross-check</h2>

      <ul className="ins-lane-list">
        <li className="ins-lane ins-lane--primary">
          <span className="m ins-lane-name">PRIMARY PANEL</span>
          <span className="ins-lane-att num">{formatAtt(impact?.att)}</span>
          <span className="ins-lane-unit">{unit}</span>
          <span className="ins-lane-p num">{formatP(impact?.p_value)}</span>
          <p className="ins-lane-detail">
            {impact?.panelSource === 'cams_eac4'
              ? 'CAMS EAC4 reanalysis — used as the headline where no calibrated satellite panel was available.'
              : 'ACAG v6 satellite PM2.5, calibrated against ground anchors.'}
          </p>
        </li>

        {rows.map((row) => (
          <li key={row.key} className="ins-lane">
            <span className="m ins-lane-name">{row.label}</span>
            {row.lane.att === null ? (
              <span className="ins-lane-gated">Declined to estimate</span>
            ) : (
              <>
                <span className="ins-lane-att num">{formatAtt(row.lane.att)}</span>
                <span className="ins-lane-unit">{unit}</span>
                <span className="ins-lane-p num">{formatP(row.lane.p_value)}</span>
              </>
            )}
            <p className="ins-lane-detail">
              {row.lane.att === null ? attGateReason(row.lane.status) : row.detail}
            </p>
          </li>
        ))}
      </ul>

      <p className="ins-lane-verdict">{verdict(rows, impact?.att ?? null)}</p>
    </section>
  )
}
