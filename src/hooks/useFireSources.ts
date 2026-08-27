/**
 * useFireSources — active fire hotspots as advection sources for the smoke and
 * wind-particle layers. Shares one cached request with `FireHotspots` via
 * `fetchFireFeed` (the monorepo fetched the feed twice; the cascade lives in
 * `api/fires.ts` now, so both consumers read the same load).
 */
import { useCachedResource } from './useCachedResource'
import { fetchFireFeed } from '../api/fires'
import type { FireHotspot } from '../types/globe'

const EMPTY: FireHotspot[] = []
const CACHE_TTL_MS = 30 * 60 * 1000

export function useFireSources(): FireHotspot[] {
  return useCachedResource<FireHotspot[]>(
    'globe:fire-sources',
    async () => (await fetchFireFeed())?.fires ?? EMPTY,
    CACHE_TTL_MS,
    EMPTY,
  )
}
