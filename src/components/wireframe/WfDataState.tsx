import type { ReactElement } from 'react'
import {
  dataStateRole,
  isRetryable,
  type DataState,
  type DataStateKind,
} from '../../types/dataState'

/**
 * WfDataState — the single renderer for "there is no number here, and this is why".
 * Ported from AirLens-platform apps/web/src/components/wireframe/WfDataState.tsx,
 * with react-i18next stripped (this repo has no i18n yet) — all copy is now a
 * plain-English default baked into `COPY` below rather than a `t()` call. This
 * keeps the exact same shape `t(key, fallback)` had (a lookup table + a
 * fallback string) so wiring real i18n back in later is a copy table swap, not
 * a rewrite (flagged by style-reviewer during this port).
 *
 * Renders nothing for `loading`/`ready` — loading belongs to `WfSkeleton`, and
 * a ready surface renders its data instead.
 */
const COPY: Record<Exclude<DataStateKind, 'loading' | 'ready'>, { stamp: string; title: string; lede: string }> = {
  partial: {
    stamp: 'Data · partial',
    title: 'Some values are missing',
    lede: 'The fields below resolved; the ones named did not. Nothing here is estimated to fill the gap.',
  },
  empty: {
    stamp: 'Data · none',
    title: 'Nothing recorded here',
    lede: 'The lookup worked and returned no rows. This is the real answer, not a failure.',
  },
  'no-coverage': {
    stamp: 'Data · out of coverage',
    title: 'Outside the covered area',
    lede: 'This dataset does not extend to this location. Retrying will not change that.',
  },
  unavailable: {
    stamp: 'Data · unavailable',
    title: 'The source is not reporting',
    lede: 'The upstream feed is down or serving a stale snapshot, so no current value can be shown.',
  },
  error: {
    stamp: 'Data · failed',
    title: 'Could not load this data',
    lede: 'The request failed on our side. The data itself may be fine — try again in a moment.',
  },
}

export interface WfDataStateProps {
  state: DataState
  /** `block` = section/page takeover. `inline` = one line inside a chip or row. */
  variant?: 'block' | 'inline'
  /** Retry handler. Rendered only when the kind is retryable AND this is set. */
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

function formatStamp(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16)
}

export default function WfDataState({
  state,
  variant = 'block',
  onRetry,
  retryLabel = 'Try again',
  className,
}: WfDataStateProps): ReactElement | null {
  if (state.kind === 'loading' || state.kind === 'ready') return null

  const copy = COPY[state.kind]
  const role = dataStateRole(state.kind)
  const showRetry = isRetryable(state.kind) && onRetry !== undefined

  const classes = ['wf-datastate', `wf-datastate-${variant}`, `wf-datastate-${state.kind}`]
  if (className) classes.push(className)

  const retryButton = showRetry ? (
    <button type="button" className="wf-datastate-retry t-micro" onClick={onRetry}>
      {retryLabel}
    </button>
  ) : null

  if (variant === 'inline') {
    return (
      <span className={classes.join(' ')} role={role}>
        <span className="wf-datastate-stamp t-micro">{copy.stamp}</span>
        <span className="wf-datastate-title t-caption">{copy.title}</span>
        {retryButton}
      </span>
    )
  }

  return (
    <div className={classes.join(' ')} role={role}>
      <span className="wf-datastate-stamp t-micro">{copy.stamp}</span>
      <p className="wf-datastate-title t-data">{copy.title}</p>
      <p className="wf-datastate-lede t-caption">{copy.lede}</p>

      <dl className="wf-datastate-meta t-micro">
        {state.affectedFields.length > 0 && (
          <div className="wf-datastate-meta-row">
            <dt>Affected</dt>
            <dd>{state.affectedFields.join(', ')}</dd>
          </div>
        )}
        {state.source !== null && (
          <div className="wf-datastate-meta-row">
            <dt>Source</dt>
            <dd>{state.source}</dd>
          </div>
        )}
        {state.lastSuccessAt !== null && (
          <div className="wf-datastate-meta-row">
            <dt>Last good</dt>
            <dd>{formatStamp(state.lastSuccessAt)}</dd>
          </div>
        )}
      </dl>

      {retryButton}
    </div>
  )
}
