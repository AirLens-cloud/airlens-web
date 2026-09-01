/**
 * DataProductCard — one product in the `/datasets` catalog grid.
 * Front face shows the question + freshness + license; clicking expands the
 * full manifest fields in place (§4 of `datasets-data-product-catalog.md`).
 */
import { useState } from 'react'
import type { DatasetProduct } from './datasetManifests'

export interface DataProductCardProps {
  product: DatasetProduct
}

export default function DataProductCard({ product }: DataProductCardProps) {
  const [open, setOpen] = useState(false)
  return (
    <article className="cat-card" data-testid="dataset-card">
      <button
        type="button"
        className="cat-card-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="cat-card-question">{product.question}</span>
        <h2 className="cat-card-title">{product.title}</h2>
        <dl className="cat-card-meta">
          <div>
            <dt className="m">NATURE</dt>
            <dd>{product.nature}</dd>
          </div>
          <div>
            <dt className="m">COVERAGE</dt>
            <dd>{product.coverage}</dd>
          </div>
          <div>
            <dt className="m">FRESHNESS</dt>
            <dd>{product.freshness}</dd>
          </div>
          <div>
            <dt className="m">LICENSE</dt>
            <dd>{product.license}</dd>
          </div>
        </dl>
      </button>

      {open ? (
        <div className="cat-card-detail">
          <h3 className="cat-detail-heading">Schema</h3>
          <table className="cat-schema-table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Unit</th>
              </tr>
            </thead>
            <tbody>
              {product.schema.map((f) => (
                <tr key={f.name}>
                  <td className="num">{f.name}</td>
                  <td>{f.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="cat-detail-heading">Sample ({product.sample.length} rows)</h3>
          {product.sample.length > 0 ? (
            <div className="cat-table-wrap">
              <table className="cat-schema-table" data-testid="dataset-sample-table">
                <thead>
                  <tr>
                    {Object.keys(product.sample[0]).map((k) => (
                      <th scope="col" key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {product.sample.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => (
                        <td className="num" key={j}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="cat-note">No sample rows in this poll.</p>
          )}

          <dl className="cat-detail">
            <div>
              <dt className="m">SOURCE</dt>
              <dd>{product.sourceLabel}</dd>
            </div>
            <div>
              <dt className="m">HASH</dt>
              <dd>{product.hash}</dd>
            </div>
          </dl>

          <div className="cat-card-actions">
            <button type="button" className="cat-btn cat-btn--disabled" disabled>
              Open sample in Lab — Lab is in feasibility review
            </button>
          </div>
        </div>
      ) : null}
    </article>
  )
}
