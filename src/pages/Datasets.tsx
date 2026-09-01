/**
 * Datasets — /datasets. Data Product Catalog (Wave B-6).
 *
 * Two candidate products today (`components/catalog/datasetManifests.ts`) —
 * the PM2.5 hourly grid and the country annual panel — built live from the
 * feeds this app already reads. Neither carries a hash or license this
 * codebase publishes; both fields render `Not published` rather than a
 * fabricated value (see that module's header for why). A product whose live
 * fetch fails is withheld from the grid entirely and counted, never shown
 * with placeholder numbers.
 */
import { useEffect, useState } from 'react'
import { fetchDatasetCatalog, type DatasetCatalog } from '../components/catalog/datasetManifests'
import DataProductCard from '../components/catalog/DataProductCard'
import WfPlaceholder from '../components/wireframe/WfPlaceholder'
import PublicPageContainer from '../components/wireframe/PublicPageContainer'
import '../styles/catalog.css'

type PageStatus = 'loading' | 'ready' | 'error'

export default function Datasets() {
  const [status, setStatus] = useState<PageStatus>('loading')
  const [catalog, setCatalog] = useState<DatasetCatalog | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchDatasetCatalog()
      .then((next) => {
        if (cancelled) return
        setCatalog(next)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'loading') {
    return (
      <PublicPageContainer tier="hub" className="cat-page">
        <div className="cat-shell">
          <WfPlaceholder height={220} label="Loading the data product catalog…" />
        </div>
      </PublicPageContainer>
    )
  }

  if (status === 'error' || !catalog) {
    return (
      <PublicPageContainer tier="hub" className="cat-page">
        <div className="cat-shell">
          <h1 className="cat-title">Datasets</h1>
          <p className="cat-error">
            The data product catalog could not be built. This is a failure to read the
            underlying feeds, not a statement that no products exist.
          </p>
        </div>
      </PublicPageContainer>
    )
  }

  return (
    <PublicPageContainer tier="hub" className="cat-page">
      <div className="cat-shell">
        <header className="cat-header">
          <div>
            <h1 className="cat-title">What can you answer with this data?</h1>
            <p className="cat-subtitle">
              Query-ready products this app actually publishes — not a download list.
            </p>
          </div>
        </header>

        {catalog.products.length === 0 ? (
          <p className="cat-empty" data-testid="datasets-empty">
            No product currently has a complete manifest, so the catalog is empty. This is
            not an error — it is what "trustworthy right now" actually contains.
          </p>
        ) : (
          <div className="cat-card-grid" data-testid="dataset-grid">
            {catalog.products.map((p) => (
              <DataProductCard key={p.id} product={p} />
            ))}
          </div>
        )}

        <p className="cat-note" data-testid="datasets-totals">
          {catalog.products.length} product{catalog.products.length === 1 ? '' : 's'} listed.
          {catalog.withheldCount > 0
            ? ` ${catalog.withheldCount} withheld — products without a complete manifest are not listed.`
            : ''}
        </p>
      </div>
    </PublicPageContainer>
  )
}
