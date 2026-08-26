/**
 * Data state contract — the shared vocabulary a data surface uses to say *why*
 * a number is missing. Ported verbatim from AirLens-platform
 * apps/web/src/types/dataState.ts.
 */

export type DataStateKind =
  /** Request in flight. The only kind that is allowed to look temporary. */
  | 'loading'
  /** Every field this surface promises is present and trustworthy. */
  | 'ready'
  /** Some fields resolved, some did not — `affectedFields` names the gaps. */
  | 'partial'
  /** The lookup succeeded and legitimately returned nothing. */
  | 'empty'
  /** This location/entity lies outside what the dataset covers. Permanent. */
  | 'no-coverage'
  /** The upstream feed is down, absent, or serving a stale baseline. */
  | 'unavailable'
  /** Our own request failed — network, non-2xx, or a malformed payload. */
  | 'error'

const ABSENT_KINDS: ReadonlySet<DataStateKind> = new Set<DataStateKind>([
  'empty',
  'no-coverage',
  'unavailable',
  'error',
])

const RETRYABLE_KINDS: ReadonlySet<DataStateKind> = new Set<DataStateKind>(['unavailable', 'error'])

export interface DataStateMeta {
  /** Epoch ms of the last time this surface held trustworthy data, or `null`. Never `Date.now()`. */
  lastSuccessAt: number | null
  /** Feed identifier this surface depends on, or `null` when unattributed. */
  source: string | null
  /** Field keys that are missing or untrustworthy. */
  affectedFields: string[]
}

export interface DataState extends DataStateMeta {
  kind: DataStateKind
}

export const UNKNOWN_META: DataStateMeta = {
  lastSuccessAt: null,
  source: null,
  affectedFields: [],
}

export function dataState(kind: DataStateKind, meta: Partial<DataStateMeta> = {}): DataState {
  return { kind, ...UNKNOWN_META, ...meta }
}

export function isAbsent(kind: DataStateKind): boolean {
  return ABSENT_KINDS.has(kind)
}

export function isRetryable(kind: DataStateKind): boolean {
  return RETRYABLE_KINDS.has(kind)
}

export function dataStateRole(kind: DataStateKind): 'alert' | 'status' {
  return kind === 'error' || kind === 'unavailable' ? 'alert' : 'status'
}
