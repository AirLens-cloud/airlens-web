/**
 * DataHealth store — ported verbatim from AirLens-platform apps/web
 * `src/store/dataHealthStore.ts`.
 */
import { create } from 'zustand'
import type { FeedHealth } from '../types/dataHealth'

interface DataHealthState {
  /** Keyed by feed identifier (mac `health.json` source key, e.g. `'gefs-chem'`). */
  feeds: Record<string, FeedHealth>
  /** Epoch ms of the last successful poll — null before the first one. */
  lastPolledAt: number | null
  /** Replaces the whole feed map — used by the CDN `health.json` poll. */
  setFeeds: (feeds: Record<string, FeedHealth>, polledAtMs: number) => void
  /** Merges a single feed's report. */
  reportFeed: (health: FeedHealth) => void
  reset: () => void
}

/**
 * Pure data only — no `degraded` field on purpose. Degraded is a judgment
 * that decays with wall-clock time even when nothing is written to this
 * store, so callers derive it at read time via `isDegraded(feeds, pollStale)`
 * against a live `now`.
 */
export const useDataHealthStore = create<DataHealthState>((set, get) => ({
  feeds: {},
  lastPolledAt: null,
  setFeeds: (feeds, polledAtMs) => set({ feeds, lastPolledAt: polledAtMs }),
  reportFeed: (health) => set({ feeds: { ...get().feeds, [health.source]: health } }),
  reset: () => set({ feeds: {}, lastPolledAt: null }),
}))
