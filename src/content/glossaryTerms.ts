/**
 * glossaryTerms.ts — the ~12-term seed catalog for `/glossary` and TermLink
 * (page-specs/methodology-glossary-knowledge-system.md §5 GlossaryTerm model).
 *
 * Definitions are written to be consistent with this repo's own evidence
 * vocabulary as described in the approved page specs (DataNature-style
 * classification, p10-p90 uncertainty, DQSS quality grade, stale/withheld
 * status). EVIDENCE_CONTRACT.md itself was not locatable in this worktree at
 * authoring time — cross-check these definitions against it before treating
 * this file as the final SSOT (methodology-glossary-knowledge-system.md §8-2
 * requires definition-schema parity; that check is still open, see
 * Glossary.tsx header note).
 */

export type GlossaryCategory = 'nature' | 'quality' | 'method' | 'ui'

export interface GlossaryTerm {
  termId: string
  term: string
  definition: string
  example: string
  methodRef?: string
  relatedTerms: string[]
  natureTag: GlossaryCategory
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    termId: 'interpolated',
    term: 'Interpolated',
    definition:
      'A value estimated for a location that has no direct sensor, filled in from nearby measurements rather than measured on the spot.',
    example: '"18.2 µg/m³ (interpolated)" — no station sits exactly here; the value is inferred from the surrounding grid.',
    methodRef: 'grid-vs-station',
    relatedTerms: ['coverage', 'nature'],
    natureTag: 'nature',
  },
  {
    termId: 'forecast',
    term: 'Forecast',
    definition:
      'A value that describes a future or near-future condition, produced by a model run rather than observed at that time.',
    example: '"32.1 µg/m³ (forecast, +6h)" shown with a p10–p90 range rather than a single number.',
    methodRef: 'forecast',
    relatedTerms: ['p10-p90', 'nature', 'sdid'],
    natureTag: 'nature',
  },
  {
    termId: 'p10-p90',
    term: 'p10–p90',
    definition:
      'The uncertainty range around an estimate: the true value is expected to fall between the 10th and 90th percentile band roughly 80% of the time. It is not an error bar drawn for decoration — it is the model’s own stated confidence.',
    example: '"24 µg/m³ (p10 18 – p90 31)" means the model expects the true value most likely somewhere in that band.',
    methodRef: 'uncertainty',
    relatedTerms: ['dqss', 'forecast', 'coverage'],
    natureTag: 'quality',
  },
  {
    termId: 'dqss',
    term: 'DQSS',
    definition:
      'Data Quality & Source Score — a letter grade (A–F) summarizing how much confidence to place in a given value, based on source tier, freshness, and coverage.',
    example: 'A value badged "DQSS: B" is trustworthy but not the highest tier available for that location.',
    methodRef: 'dqss',
    relatedTerms: ['p10-p90', 'coverage'],
    natureTag: 'quality',
  },
  {
    termId: 'nature',
    term: 'Nature',
    definition:
      'The classification AirLens attaches to every value describing how it was produced — for example observation, interpolated, or forecast. Nature is shown at the value itself, not buried in a footnote.',
    example: 'A value labeled "nature: forecast" is drawn with a hatch pattern rather than a solid fill to mark it as not-yet-observed.',
    methodRef: 'nature-overview',
    relatedTerms: ['interpolated', 'forecast', 'coverage'],
    natureTag: 'nature',
  },
  {
    termId: 'stale',
    term: 'Stale',
    definition:
      'A value whose last successful update is older than the freshness window AirLens expects for that source. Stale values are still shown, but marked as stale with the last-known time — not silently replaced with a newer-looking placeholder.',
    example: '"Last updated 6h ago (stale)" instead of quietly showing an old number as if it were current.',
    relatedTerms: ['withheld', 'dqss'],
    natureTag: 'ui',
  },
  {
    termId: 'withheld',
    term: 'Withheld',
    definition:
      'AirLens deliberately does not show a value when confidence is too low to publish it responsibly — a withheld value is not a bug or missing data, it is a decision.',
    example: 'A grid cell with no nearby sensor and no reliable satellite pass shows "Withheld" rather than a guessed number.',
    relatedTerms: ['stale', 'dqss', 'coverage'],
    natureTag: 'ui',
  },
  {
    termId: 'aqi',
    term: 'AQI',
    definition:
      'Air Quality Index — a standardized 0–500+ scale converting raw pollutant concentrations into health-relevant tiers (good, moderate, unhealthy, etc). AirLens follows EPA breakpoints; one AirLens-specific threshold used in a couple of surfaces is disclosed as not standard.',
    example: '"AQI 142 (Unhealthy for Sensitive Groups)" derived from a measured or estimated PM2.5 concentration.',
    methodRef: 'aqi-conversion',
    relatedTerms: ['pm25'],
    natureTag: 'method',
  },
  {
    termId: 'pm25',
    term: 'PM2.5',
    definition:
      'Fine particulate matter 2.5 micrometers or smaller — the primary pollutant AirLens tracks, measured in µg/m³. It is the input most AQI conversions and forecasts on this site are built from.',
    example: '"PM2.5: 24.6 µg/m³" is the raw concentration before it is converted to an AQI tier.',
    methodRef: 'aqi-conversion',
    relatedTerms: ['aqi', 'coverage'],
    natureTag: 'method',
  },
  {
    termId: 'sdid',
    term: 'SDID',
    definition:
      'Synthetic Difference-in-Differences — a causal-inference method used on Insights to estimate what a policy likely changed, by comparing the treated area against a statistically constructed synthetic control.',
    example: 'An SDID estimate reads "likely reduced PM2.5 by 4.2 µg/m³ (ATT)" rather than claiming certainty.',
    methodRef: 'sdid',
    relatedTerms: ['att', 'forecast'],
    natureTag: 'method',
  },
  {
    termId: 'att',
    term: 'ATT',
    definition:
      'Average Treatment effect on the Treated — the specific quantity an SDID analysis estimates: on average, how much did the outcome change for the units that actually experienced the policy, compared to their synthetic counterfactual.',
    example: 'An ATT of "−4.2 µg/m³" means the treated cities averaged 4.2 µg/m³ lower PM2.5 than their synthetic control predicts.',
    methodRef: 'sdid',
    relatedTerms: ['sdid'],
    natureTag: 'method',
  },
  {
    termId: 'coverage',
    term: 'Coverage',
    definition:
      'How much of a region has a nearby, trustworthy data source versus relying on interpolation or being withheld outright. Coverage is why some areas show confident readings and neighboring areas show "withheld."',
    example: 'A city with three ground stations has high coverage; a remote area relying on satellite-only estimates has lower coverage.',
    methodRef: 'grid-vs-station',
    relatedTerms: ['interpolated', 'withheld', 'dqss'],
    natureTag: 'quality',
  },
]

export function findGlossaryTerm(termId: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find((t) => t.termId === termId)
}
