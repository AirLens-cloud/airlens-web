/**
 * Dataset manifest builder — `/datasets` data layer.
 *
 * `datasets-data-product-catalog.md` (Wave B-6) specs the catalog as a
 * consumer of a published Data Product Manifest v1 that does not exist yet
 * (§3/§13 of that doc: "어떤 product도 manifest가 없어 카탈로그 자체가 성립
 * 불가"). This module builds the closest honest substitute from the two
 * artifacts this app already reads and can describe accurately —
 * `fetchGlobalGridSnapshot` (the PM2.5 grid) and `fetchCountrySeries`/
 * `fetchCountryCoverage` (the annual country panel).
 *
 * Fields the real manifest would carry but this codebase does not publish
 * (hash, license) are marked `NOT_PUBLISHED` rather than invented — the same
 * honesty rule `api/registry.ts` applies to its `license` column. A product
 * whose live fetch fails outright is dropped from the catalog and counted,
 * mirroring the spec's "withheld product 주입 → 카탈로그에서 완전히 사라짐"
 * acceptance test (§11-7) — this is the one deliberate exception to the
 * "never disappear a value, show the reason" rule used elsewhere, and the
 * spec calls it out as intentional (§5's "카탈로그 게이트가 곧 렌더 게이트의
 * 카탈로그 판").
 */
import { fetchGlobalGridSnapshot } from '../../api/gridSnapshot'
import { fetchCountryCoverage, fetchCountrySeries } from '../../api/countrySeries'
import { feedPipeline } from '../../lib/config/globeOntology'

export const NOT_PUBLISHED = 'Not published'

export interface SchemaField {
  name: string
  unit: string
}

export interface SampleRow {
  [key: string]: string
}

export interface DatasetProduct {
  id: string
  title: string
  question: string
  nature: string
  coverage: string
  freshness: string
  license: string
  hash: string
  schema: SchemaField[]
  sample: SampleRow[]
  sourceLabel: string
}

export interface DatasetCatalog {
  products: DatasetProduct[]
  withheldCount: number
}

const SAMPLE_ROW_LIMIT = 10

async function buildGridProduct(): Promise<DatasetProduct> {
  const pipeline = feedPipeline('aq-grid')
  const snap = await fetchGlobalGridSnapshot({ limit: SAMPLE_ROW_LIMIT })
  return {
    id: 'pm25-hourly-grid',
    title: 'PM2.5 hourly grid',
    question: 'What is the estimated PM2.5 concentration anywhere on the globe, right now?',
    nature: 'Interpolated grid (Open-Meteo Air Quality, republished via the mac free-tier pipeline)',
    coverage: `Global, ${pipeline.resolution} grid`,
    freshness: `${snap.stale ? 'Stale' : 'Ready'} — last updated ${snap.updatedAt}`,
    license: NOT_PUBLISHED,
    hash: NOT_PUBLISHED,
    schema: [
      { name: 'lat', unit: 'degrees' },
      { name: 'lon', unit: 'degrees' },
      { name: 'pm25', unit: 'µg/m³' },
      { name: 'aqi', unit: 'US EPA AQI' },
      { name: 'dqss', unit: '0–100 (when published)' },
    ],
    sample: snap.nearbyCells.map((c) => ({
      lat: c.lat.toFixed(2),
      lon: c.lon.toFixed(2),
      pm25: c.pm25.toFixed(1),
      aqi: String(c.aqi),
      dqss: c.dqss !== undefined ? String(c.dqss) : '—',
    })),
    sourceLabel: pipeline.source,
  }
}

async function buildCountryPanelProduct(): Promise<DatasetProduct> {
  const coverage = await fetchCountryCoverage()
  if (coverage.length === 0) throw new Error('country coverage index empty')
  const sampleCode = coverage.find((c) => c.code === 'KR')?.code ?? coverage[0].code
  const panel = await fetchCountrySeries(sampleCode)
  if (!panel || panel.points.length === 0) throw new Error(`no published panel for ${sampleCode}`)
  const totalStations = coverage.reduce((sum, c) => sum + (c.totalStations || 0), 0)
  return {
    id: 'country-annual-panel',
    title: 'Country annual PM2.5 panel',
    question: 'How has a country\'s observed PM2.5 changed year over year, and how tight is the observed spread?',
    nature: 'Observation panel (per-country annual mean, station-day spread)',
    coverage: `${coverage.length} countries published, ${totalStations} stations total`,
    freshness: panel.generatedAt
      ? `Ready — sample country ${panel.countryCode} last generated ${panel.generatedAt}`
      : `Ready — sample country ${panel.countryCode} (no generatedAt published)`,
    license: NOT_PUBLISHED,
    hash: NOT_PUBLISHED,
    schema: [
      { name: 'year', unit: 'calendar year' },
      { name: 'pm25', unit: 'µg/m³, annual mean' },
      { name: 'p10', unit: 'µg/m³, observed spread (may be null)' },
      { name: 'p90', unit: 'µg/m³, observed spread (may be null)' },
      { name: 'stationCount', unit: 'contributing stations' },
    ],
    sample: panel.points.slice(-SAMPLE_ROW_LIMIT).map((p) => ({
      year: String(p.year),
      pm25: p.pm25.toFixed(1),
      p10: p.p10 !== null ? p.p10.toFixed(1) : '—',
      p90: p.p90 !== null ? p.p90.toFixed(1) : '—',
      stationCount: p.stationCount !== null ? String(p.stationCount) : '—',
    })),
    sourceLabel: `${panel.sourcesUsed.join(', ') || 'unpublished sources'} (sample: ${sampleCode})`,
  }
}

/**
 * Builds the catalog from both candidate products. A product whose fetch
 * throws is withheld, not shown with an error card — the catalog is meant
 * to be "everything currently trustworthy", not a status board.
 */
export async function fetchDatasetCatalog(): Promise<DatasetCatalog> {
  const results = await Promise.allSettled([buildGridProduct(), buildCountryPanelProduct()])
  const products = results
    .filter((r): r is PromiseFulfilledResult<DatasetProduct> => r.status === 'fulfilled')
    .map((r) => r.value)
  const withheldCount = results.length - products.length
  return { products, withheldCount }
}
