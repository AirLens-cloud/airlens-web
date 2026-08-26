/**
 * Country PM2.5 panel reader — `insights-data/by_country/<CC>.json` on the HF
 * live dataset, mapped onto the `CountryPanel` contract the Insights surface
 * consumes.
 *
 * New in this repo. The monorepo built the same panel from a Supabase table
 * (`policy_panel_yearly`) and, for the trend chart, synthesised a p10/p90 by
 * multiplying the mean by two constants. This feed publishes the interval the
 * pipeline actually measured across its contributing sources, so the band is
 * carried straight through — and stays null on the years that have none rather
 * than being filled in.
 */
import { HF_LIVE_BASE } from '../lib/config/dataSources'
import { logger } from '../lib/logger'
import type { CountryPanel, CountryPanelPoint } from '../types/policy'

const SERIES_BASE = `${HF_LIVE_BASE}/insights-data/by_country`
const INDEX_URL = `${HF_LIVE_BASE}/insights-data/index.json`

interface RawSeriesPoint {
  year?: number
  pm25Mean?: number
  p10?: number | null
  p90?: number | null
  stationCount?: number | null
  recordCount?: number | null
  sources?: string[]
}

interface RawCountrySeries {
  country?: string
  yearRange?: [number, number]
  series?: RawSeriesPoint[]
  sourcesUsed?: string[]
  totalStations?: number | null
  policy?: { treatment_year?: number | null; policy_name?: string | null }
  generatedAt?: string | null
}

/** Country coverage row from insights-data/index.json. */
export interface CountryCoverage {
  code: string
  yearRange: [number, number]
  years: number
  totalStations: number
  sourcesUsed: string[]
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * A year with no usable mean is dropped, not zero-filled: the panel is meant to
 * show where observation actually exists. p10/p90 stay null independently — a
 * published mean without a published interval is a real state, and inventing
 * one from the mean is exactly what this feed exists to stop.
 */
function mapPoints(raw: RawSeriesPoint[] | undefined): CountryPanelPoint[] {
  if (!Array.isArray(raw)) return []
  const out: CountryPanelPoint[] = []
  for (const p of raw) {
    if (!finite(p.year) || !finite(p.pm25Mean)) continue
    out.push({
      year: p.year,
      pm25: p.pm25Mean,
      p10: finite(p.p10) ? p.p10 : null,
      p90: finite(p.p90) ? p.p90 : null,
      stationCount: finite(p.stationCount) ? p.stationCount : null,
      sources: Array.isArray(p.sources) ? p.sources : [],
    })
  }
  return out.sort((a, b) => a.year - b.year)
}

/**
 * One country's observed panel. Returns null (never throws) so callers render
 * an honest empty state; a country with a published file but no usable years
 * also returns null rather than an empty chart claiming a flat series.
 */
export async function fetchCountrySeries(
  countryCode: string,
  meta?: { countryName?: string | null; flag?: string | null },
): Promise<CountryPanel | null> {
  const cc = (countryCode ?? '').toUpperCase()
  if (!/^[A-Z]{2,3}$/.test(cc)) return null
  try {
    const res = await fetch(`${SERIES_BASE}/${cc}.json`)
    if (!res.ok) return null
    const raw = (await res.json()) as RawCountrySeries
    const points = mapPoints(raw.series)
    if (points.length === 0) return null
    return {
      countryCode: cc,
      countryName: meta?.countryName ?? null,
      flag: meta?.flag ?? null,
      points,
      sourcesUsed: Array.isArray(raw.sourcesUsed) ? raw.sourcesUsed : [],
      totalStations: finite(raw.totalStations) ? raw.totalStations : null,
      treatmentYear: finite(raw.policy?.treatment_year) ? raw.policy.treatment_year : null,
      policyName: raw.policy?.policy_name || null,
      generatedAt: raw.generatedAt ?? null,
    }
  } catch (err) {
    logger.warn('fetchCountrySeries threw:', err)
    return null
  }
}

/** Which countries have a published panel, and how much of one. */
export async function fetchCountryCoverage(): Promise<CountryCoverage[]> {
  try {
    const res = await fetch(INDEX_URL)
    if (!res.ok) return []
    const json = (await res.json()) as { countries?: CountryCoverage[] }
    return Array.isArray(json.countries) ? json.countries : []
  } catch (err) {
    logger.warn('fetchCountryCoverage failed:', err)
    return []
  }
}
