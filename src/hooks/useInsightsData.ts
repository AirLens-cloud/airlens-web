/**
 * useInsightsData — everything the Insights hub reads, in load order.
 *
 * Two effects, not one: the catalogue (summary + index) loads once and never
 * again, while the country detail (impact curve + observed panel + regional
 * peers) reloads on selection. Keeping them apart means switching country never
 * re-fetches the catalogue, and a failed detail load never blanks the picker.
 *
 * No react-query in this repo, so this is plain `useEffect` + `useState` with a
 * cancellation flag. Statuses are explicit and separate — a failed fetch and an
 * empty result are different facts, and collapsing them would present an outage
 * as "this country was never analysed".
 */
import { useEffect, useMemo, useState } from 'react'
import {
  fetchCountryPolicyImpact,
  fetchPolicyIndex,
  fetchPolicySummary,
} from '../api/policy'
import { fetchCountrySeries } from '../api/countrySeries'
import { COUNTRY_CENTERS } from '../lib/config/countryCenters'
import type {
  CountryPanel,
  PolicyImpact,
  PolicyIndexEntry,
  PolicySummaryRow,
} from '../types/policy'

/** Regional peers fetched for the map/trend bands. Europe alone has 37. */
const MAP_PEER_LIMIT = 24

export type LoadStatus = 'loading' | 'ready' | 'error'

/** An analysed country, joined to its index metadata where the index has it. */
export interface AnalysedCountry {
  countryCode: string
  /** Display name, or the ISO code when the index does not list the country. */
  name: string
  flag: string | null
  region: string | null
  /** Present only for a country the index knows about. */
  pm25AnnualStandard: number | null
  summary: PolicySummaryRow
}

export interface InsightsCatalogue {
  status: LoadStatus
  countries: AnalysedCountry[]
  generatedAt: string | null
  /** Countries in the estimated set that the index does not name. */
  unnamedCount: number
}

export interface InsightsDetail {
  status: LoadStatus
  impact: PolicyImpact | null
  panel: CountryPanel | null
  /** Region peers with a published panel AND a map anchor. */
  peerPanels: CountryPanel[]
  /** Region peers dropped for want of a map anchor — surfaced, not hidden. */
  peersWithoutAnchor: string[]
  /** Peers beyond MAP_PEER_LIMIT that were never requested. */
  peersOmitted: number
}

function joinCountries(
  rows: PolicySummaryRow[],
  index: PolicyIndexEntry[],
): AnalysedCountry[] {
  const byCode = new Map(index.map((e) => [e.countryCode.toUpperCase(), e]))
  return rows
    .map((summary) => {
      const entry = byCode.get(summary.countryCode.toUpperCase())
      return {
        countryCode: summary.countryCode.toUpperCase(),
        name: entry?.country ?? summary.countryCode.toUpperCase(),
        flag: entry?.flag ?? null,
        region: entry?.region ?? null,
        pm25AnnualStandard: entry?.pm25AnnualStandard ?? null,
        summary,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The estimated set, loaded once. */
export function useInsightsCatalogue(): InsightsCatalogue {
  const [state, setState] = useState<Omit<InsightsCatalogue, 'unnamedCount'>>({
    status: 'loading',
    countries: [],
    generatedAt: null,
  })

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchPolicySummary(), fetchPolicyIndex()])
      .then(([summary, index]) => {
        if (cancelled) return
        if (!summary) {
          setState({ status: 'error', countries: [], generatedAt: null })
          return
        }
        setState({
          status: 'ready',
          countries: joinCountries(summary.countries, index),
          generatedAt: summary.generatedAt,
        })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', countries: [], generatedAt: null })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const unnamedCount = useMemo(
    () => state.countries.filter((c) => c.name === c.countryCode).length,
    [state.countries],
  )

  return { ...state, unnamedCount }
}

const EMPTY_DETAIL: InsightsDetail = {
  status: 'loading',
  impact: null,
  panel: null,
  peerPanels: [],
  peersWithoutAnchor: [],
  peersOmitted: 0,
}

/**
 * One country's detail, plus the regional peers the map and the trend band
 * draw. A peer that fails to load is dropped rather than retried — the map is
 * a comparison surface, and one missing neighbour degrades it honestly.
 */
export function useInsightsDetail(
  selected: AnalysedCountry | null,
  catalogue: AnalysedCountry[],
): InsightsDetail {
  // Keyed by the request it answers, so a settled result for the previous
  // country is never shown under the new one's heading, and switching country
  // returns to `loading` by derivation rather than by a reset write.
  const [settled, setSettled] = useState<{ key: string; detail: InsightsDetail } | null>(null)

  // Peers are derived here so the effect below depends on a stable string.
  const peerCodes = useMemo(() => {
    if (!selected) return [] as string[]
    const pool = selected.region
      ? catalogue.filter((c) => c.region === selected.region)
      : [selected]
    return pool.map((c) => c.countryCode)
  }, [selected, catalogue])

  const anchored = useMemo(() => peerCodes.filter((cc) => COUNTRY_CENTERS[cc]), [peerCodes])
  const unanchored = useMemo(() => peerCodes.filter((cc) => !COUNTRY_CENTERS[cc]), [peerCodes])
  const requestKey = anchored.slice(0, MAP_PEER_LIMIT).join(',')
  const key = selected ? `${selected.countryCode}|${requestKey}` : ''

  useEffect(() => {
    if (!selected) return
    let cancelled = false

    const codes = requestKey ? requestKey.split(',') : []
    const meta = { countryName: selected.name, flag: selected.flag }

    Promise.all([
      fetchCountryPolicyImpact(selected.countryCode),
      fetchCountrySeries(selected.countryCode, meta),
      Promise.all(codes.map((cc) => fetchCountrySeries(cc))),
    ])
      .then(([impact, panel, peers]) => {
        if (cancelled) return
        setSettled({
          key,
          detail: {
            status: 'ready',
            impact,
            panel,
            peerPanels: peers.filter((p): p is CountryPanel => p !== null),
            peersWithoutAnchor: unanchored,
            peersOmitted: Math.max(0, anchored.length - codes.length),
          },
        })
      })
      .catch(() => {
        if (!cancelled) setSettled({ key, detail: { ...EMPTY_DETAIL, status: 'error' } })
      })

    return () => {
      cancelled = true
    }
    // `anchored`/`unanchored` are derived from the same inputs as `requestKey`;
    // depending on the arrays too would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, requestKey, key])

  // No selection is a settled state, not a pending one — saying "loading" with
  // nothing on the way would leave a spinner that never resolves.
  if (!selected) return { ...EMPTY_DETAIL, status: 'ready' }
  return settled?.key === key ? settled.detail : EMPTY_DETAIL
}
