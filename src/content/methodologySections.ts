/**
 * methodologySections.ts — the section catalog for `/methodology`
 * (page-specs/methodology-glossary-knowledge-system.md §4.1, §5
 * MethodologySection model).
 *
 * Each section is fixed "what / why / limitations" — limitations are never
 * omitted (Glass-box principle: a methods page that only lists advantages is
 * marketing copy, not a methods page). `exampleCursorTemplate` describes how
 * to build a scene link into Globe/Weather/Insights for that method; it is a
 * template, not a live cursor value — this repo does not yet have an
 * AnalysisCursor implementation (§8 of the spec), so "Open this in Globe"
 * links here point at the page itself rather than an encoded cursor until
 * that lands.
 */

export interface MethodologySection {
  sectionId: string
  title: string
  what: string
  why: string
  limitations: string
  relatedTermIds: string[]
  exampleHref?: string
  exampleLabel?: string
}

export const METHODOLOGY_SECTIONS: MethodologySection[] = [
  {
    sectionId: 'nature-overview',
    title: 'Data nature — how a value was produced',
    what: 'Every value AirLens renders carries a "nature" tag describing how it came to exist: observed at a station, a numerical model’s current-state analysis, interpolated between stations, derived from a satellite pass, forecast by a model, inferred through causal analysis, or a fact about a policy action itself. These seven values are the Evidence Contract vocabulary this site publishes against.',
    why: 'A number alone hides how much to trust it. Marking nature at the value lets you tell "measured right here" apart from "estimated for here" without reading a footnote — and, just as importantly, tells apart two different kinds of "estimated": a model’s best read of right now (analysis) versus its guess about later (forecast).',
    limitations: 'Nature classification is chosen at publish time by the data pipeline, not re-derived per view — if the underlying method changes, older published values keep their original nature tag.',
    relatedTermIds: ['nature', 'analysis', 'interpolated', 'forecast'],
    exampleLabel: 'See it on the Globe',
    exampleHref: '/globe',
  },
  {
    sectionId: 'nature-observation',
    title: 'Nature: observation',
    what: 'A value read directly from a ground sensor at approximately the time and place shown.',
    why: 'The most direct evidence AirLens has — no model or interpolation stands between the sensor and the number.',
    limitations: 'Ground sensors have their own calibration drift and siting bias; "observed" does not mean "error-free," only "not modeled."',
    relatedTermIds: ['nature', 'coverage'],
  },
  {
    sectionId: 'nature-analysis',
    title: 'Nature: analysis',
    what: 'A value read from a numerical model’s analysis field — the model’s own data-assimilated best estimate of the current state of the atmosphere or ocean (for example a 0-hour/"f000" run), sampled at the nearest grid point. This is the mechanism behind most of AirLens’s published pollutant and weather grids, including PM2.5 and PM10 (NOAA GEFS-Aerosols) and wind (NOAA/NCEP GFS).',
    why: 'An analysis field is a model’s reconciliation of many observations into one gridded state — it fills gaps between stations without the guesswork of distance-weighting nearby readings by hand, and without claiming to know the future the way a forecast does.',
    limitations: 'An analysis is still a model output, not a direct measurement — it inherits the model’s own resolution and assimilation error, and a coarse grid can miss local variation a nearby sensor would catch.',
    relatedTermIds: ['analysis', 'interpolated', 'coverage', 'pm25'],
  },
  {
    sectionId: 'nature-interpolated',
    title: 'Nature: interpolated',
    what: 'A value estimated for a point with no direct sensor and no published model grid, filled in from nearby measurements by distance-weighting them (inverse-distance weighting, IDW). This is a fallback, not the default: AirLens’s ordinary pollutant and weather grids are analysis or forecast fields (see "analysis"), not this kind of interpolation.',
    why: 'When neither a station nor a published model grid covers a point, IDW lets AirLens show a reasonable estimate instead of a blank map — but it is deliberately the last resort, used only when the other two are unavailable.',
    limitations: 'Accuracy degrades with distance from the nearest real sensor — interpolated values in low-coverage regions carry wider uncertainty, and this mechanism should not be assumed just because a value sits on a grid.',
    relatedTermIds: ['interpolated', 'analysis', 'coverage', 'p10-p90'],
  },
  {
    sectionId: 'nature-satellite-derived',
    title: 'Nature: satellite-derived',
    what: 'A value estimated from satellite instrument readings (e.g. aerosol optical depth) converted to a ground-level pollutant estimate.',
    why: 'Satellite coverage reaches places ground networks never will, closing spatial-justice gaps in air-quality visibility.',
    limitations: 'Conversion from satellite signal to ground concentration is itself a model with its own error — satellite-derived values are not equivalent to a ground sensor reading.',
    relatedTermIds: ['nature', 'pm25', 'coverage'],
  },
  {
    sectionId: 'nature-forecast',
    title: 'Nature: forecast',
    what: 'A value describing a future condition, produced by a model run ahead of time rather than observed as it happens.',
    why: 'Forecasts let you plan ahead of a pollution event instead of reacting to it after the fact.',
    limitations: 'Forecast skill decreases the further out the horizon extends — always shown with a p10–p90 range rather than a single confident number.',
    relatedTermIds: ['forecast', 'p10-p90'],
    exampleLabel: 'See forecasts on Weather',
    exampleHref: '/weather',
  },
  {
    sectionId: 'nature-inferred',
    title: 'Nature: inferred',
    what: 'A value derived through statistical or causal analysis rather than direct measurement or forward-looking simulation — for example, an estimated policy effect.',
    why: 'Some questions ("did this policy work?") cannot be answered by measurement alone; inference is the only path to an answer, so AirLens labels it plainly as one.',
    limitations: 'Inferred values depend on modeling assumptions (e.g. the validity of a synthetic control) that can be wrong in ways a simple measurement error cannot.',
    relatedTermIds: ['sdid', 'att'],
    exampleLabel: 'See inference on Insights',
    exampleHref: '/insights',
  },
  {
    sectionId: 'nature-policy',
    title: 'Nature: policy',
    what: 'A value or annotation describing a policy action itself (e.g. a low-emission-zone start date) rather than a measured pollutant.',
    why: 'Policy context is what makes an inferred effect (nature: inferred) legible — the two nature tags are usually shown together.',
    limitations: 'Policy metadata is curated, not automatically detected — coverage of policy events is only as complete as the catalog behind it.',
    relatedTermIds: ['sdid'],
  },
  {
    sectionId: 'aqi-conversion',
    title: 'AQI conversion',
    what: 'How a raw pollutant concentration (e.g. PM2.5 in µg/m³) is converted into the 0–500+ Air Quality Index tier shown as a color and label.',
    why: 'Raw concentrations are hard to interpret without domain knowledge; AQI tiers translate them into a health-relevant scale.',
    limitations: 'AirLens follows EPA breakpoints. One AirLens-specific threshold used in a couple of surfaces is not drawn from a published standard and is labeled as such rather than presented as an official cutoff.',
    relatedTermIds: ['aqi', 'pm25'],
  },
  {
    sectionId: 'uncertainty',
    title: 'Uncertainty (p10–p90)',
    what: 'The range within which the true value is expected to fall, reported as a 10th-to-90th-percentile band alongside every forecast and many inferred values.',
    why: 'A single number invites false confidence. The range is the model’s own statement of how sure it is.',
    limitations: 'The p10–p90 band reflects the model’s internal uncertainty estimate, not a guarantee — real-world surprises (sensor failure, sudden events) can fall outside it.',
    relatedTermIds: ['p10-p90', 'dqss'],
  },
  {
    sectionId: 'averaging-windows',
    title: 'Averaging windows',
    what: 'The time span a displayed value represents — for example an hourly reading versus a rolling 24-hour average.',
    why: 'Short-window and long-window values answer different questions ("right now" versus "the typical day"); mixing them without labeling the window invites misreading.',
    limitations: 'A rolling average smooths out short spikes — a value inside a rolling window can look calmer than any single moment actually was.',
    relatedTermIds: ['nature'],
  },
  {
    sectionId: 'grid-vs-station',
    title: 'Grid vs. station',
    what: 'The distinction between a value tied to a specific ground station and a value assigned to a grid cell covering an area with no station in it.',
    why: 'Grid cells make a continuous map possible; station values remain the most direct evidence within that map.',
    limitations: 'Grid-cell values necessarily blend the station-level nature tags underneath them (observation, interpolated, satellite-derived) — the map does not always make that blend visible at a glance.',
    relatedTermIds: ['coverage', 'interpolated'],
  },
  {
    sectionId: 'dqss',
    title: 'DQSS — source quality tier',
    what: 'Data Quality & Source Score: a letter grade (A–F) computed from source tier, freshness, and coverage, summarizing how much confidence to place in a value.',
    why: 'A single badge lets you triage trust quickly without reading the full provenance of every value.',
    limitations: 'DQSS is a summary score — two values with the same grade can still differ in exactly why they earned it (freshness versus coverage versus source tier).',
    relatedTermIds: ['dqss', 'p10-p90'],
  },
]

export function findMethodologySection(sectionId: string): MethodologySection | undefined {
  return METHODOLOGY_SECTIONS.find((s) => s.sectionId === sectionId)
}
