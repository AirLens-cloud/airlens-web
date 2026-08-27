/**
 * Policy / SDID domain types for the Insights surface.
 *
 * A subset of AirLens-platform `apps/web/src/types/policy.ts` (571 lines there,
 * most of it serving the policy registry, scenario runner and detail-proof
 * pages that are not part of this repo's Insights hub). What is here is what
 * the hub actually reads, plus `LaneCrossCheck`, which the monorepo had no type
 * for because the triple-lane re-estimation postdates it.
 */

/** One year of the SDID synthetic-control curve: actual vs counterfactual.
 *
 * The POST-treatment gap is the estimated effect; the PRE-treatment gap is
 * model fit error and must never be rendered as one. No fabricated band. */
export interface SdidPoint {
  year: number
  observed: number
  synthetic: number
}

/** Raw `synthetic_control[]` element as published in policy-impact/<CC>.json. */
export interface RawSyntheticPoint {
  date: string
  event: string
  pm25: number
  synthetic_pm25: number
}

/**
 * One re-estimation lane's verdict on the same country.
 *
 * The headline ATT comes from the primary panel (ACAG v6, ground-calibrated).
 * `cams_eac4` and `ground_stations` re-run the same design on independent
 * inputs. A lane that gated (`att: null`) is not a zero effect — it is that
 * lane declining to estimate, and the UI must keep the two apart.
 */
export interface CrossCheckLane {
  att: number | null
  status: string | null
  p_value: number | null
}

export interface LaneCrossCheck {
  cams_eac4?: CrossCheckLane
  ground_stations?: CrossCheckLane
}

/**
 * One row of `policy-impact/summary.json` — the whole 119-country SDID result
 * set in a single request, so the hub can rank, count and map without fetching
 * 119 files. The per-country file stays the source for the synthetic-control
 * curve and the cross-check lanes.
 */
export interface PolicySummaryRow {
  countryCode: string
  att: number | null
  ci_low: number | null
  ci_high: number | null
  p_value: number | null
  significant: boolean | null
  status: string | null
  treatmentYear: number | null
  panelSource: string | null
  /** SDID panel-fit score (0–100). Not sensor DQSS — a different quantity. */
  fitScore: number | null
  hasCrossCheck: boolean
}

export interface PolicySummary {
  generatedAt: string | null
  count: number
  countries: PolicySummaryRow[]
}

export interface PolicyImpact {
  id: string
  country: string | null
  /** Display name from the index (falls back to the ISO code). */
  city?: string | null
  flag?: string
  /** Policy/event name carried on the synthetic-control series, when present. */
  title?: string
  att: number | null
  ci_low: number | null
  ci_high: number | null
  p_value: number | null
  significant: boolean | null
  /** SDID panel-fit grade — see `policyDataQualityToGrade`. Not sensor DQSS. */
  dqss?: 'A' | 'B' | 'C' | 'D' | 'F'
  sdid_series?: SdidPoint[]
  /**
   * Honesty-gate status. Carries WHY no estimate exists ('insufficient_controls'
   * | 'poor_pre_fit' | 'degenerate_weights' | 'no_pre_period' | …) so the UI can
   * name the reason instead of showing a generic "no data". 'ok' when estimated.
   */
  status?: string | null
  /** Which panel produced the headline estimate (e.g. 'acag_v6_ground_cal'). */
  panelSource?: string | null
  /** Aggregate pass/fail only — the pipeline ships no per-permutation series. */
  robustness?: {
    parallelTrendPass?: boolean | null
    placeboPass?: boolean | null
    placeboMean?: number | null
  }
  crossCheck?: LaneCrossCheck
}

/** Country metadata row from policy-impact/index.json. */
export interface PolicyIndexEntry {
  country: string
  countryCode: string
  region: string
  flag: string
  policyCount: number
  lastUpdated: string
  hasStandards?: boolean
  pm25AnnualStandard?: number | null
  whoCompliance?: number | null
}

/**
 * One country-year of the observed PM2.5 panel.
 *
 * p10/p90 are the 10th and 90th percentiles of that year's station-day
 * observations inside the country (`scripts/etl/organize_data.py`) — the
 * OBSERVED SPREAD across stations and days, not a predictive uncertainty
 * interval. They are published values, never a multiplier applied to the mean,
 * and they collapse to the mean on a year with a single contributing station:
 * a zero-width spread is a real state and must not be drawn as a band.
 */
export interface CountryPanelPoint {
  year: number
  pm25: number
  p10: number | null
  p90: number | null
  stationCount: number | null
  sources: string[]
}

export interface CountryPanel {
  countryCode: string
  countryName: string | null
  flag: string | null
  points: CountryPanelPoint[]
  /** Sources contributing anywhere in the series (e.g. acag_v6, openaq). */
  sourcesUsed: string[]
  totalStations: number | null
  /** Treatment year the SDID design used for this country, when one exists. */
  treatmentYear: number | null
  policyName: string | null
  generatedAt: string | null
}
