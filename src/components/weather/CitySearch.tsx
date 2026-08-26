import { useEffect, useState } from 'react'
import { filterCities, loadCityCatalog, type WeatherCity } from '../../lib/cityCatalog'

export interface CitySearchProps {
  onSelect: (city: WeatherCity) => void
}

type CatalogState = { status: 'loading' } | { status: 'ready'; cities: WeatherCity[] } | { status: 'error' }

/**
 * CitySearch — keyboard-accessible filter over the bundled 50-city catalog
 * (S1's "Search city" panel). Loads the catalog lazily on mount (this
 * component only mounts once the panel is opened) and degrades to an honest
 * "unavailable" line rather than a blank list on fetch failure.
 */
export default function CitySearch({ onSelect }: CitySearchProps) {
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    loadCityCatalog()
      .then((cities) => {
        if (alive) setCatalog({ status: 'ready', cities })
      })
      .catch(() => {
        if (alive) setCatalog({ status: 'error' })
      })
    return () => {
      alive = false
    }
  }, [])

  const results = catalog.status === 'ready' ? filterCities(catalog.cities, query) : []

  return (
    <div className="wx-search-panel" role="search">
      <input
        className="wx-search-input"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search city or country code…"
        aria-label="Search city"
        autoFocus
      />
      <div className="wx-search-list" role="listbox" aria-label="City results">
        {catalog.status === 'loading' && <p className="wx-search-empty t-caption">Loading city list…</p>}
        {catalog.status === 'error' && (
          <p className="wx-search-empty t-caption">City list unavailable — try again in a moment.</p>
        )}
        {catalog.status === 'ready' && results.length === 0 && (
          <p className="wx-search-empty t-caption">No matching city.</p>
        )}
        {catalog.status === 'ready' &&
          results.map((city) => (
            <button
              key={`${city.name}-${city.countryCode}`}
              type="button"
              role="option"
              className="wx-search-item"
              onClick={() => onSelect(city)}
            >
              <span>{city.name}</span>
              <span className="t-micro">{city.countryCode}</span>
            </button>
          ))}
      </div>
    </div>
  )
}
