import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { filterCities, loadCityCatalog, type WeatherCity } from '../../lib/cityCatalog'

export interface CitySearchProps {
  onSelect: (city: WeatherCity) => void
  /** Escape was pressed in the search field — the parent decides how to dismiss the panel. */
  onClose?: () => void
}

type CatalogState = { status: 'loading' } | { status: 'ready'; cities: WeatherCity[] } | { status: 'error' }

/**
 * CitySearch — keyboard-accessible filter over the bundled 50-city catalog
 * (S1's "Search city" panel). Loads the catalog lazily on mount (this
 * component only mounts once the panel is opened) and degrades to an honest
 * "unavailable" line rather than a blank list on fetch failure.
 *
 * The ARIA 1.2 "combobox with a listbox popup, focus stays on the input"
 * pattern (WAI-ARIA APG), same as `CountryCombobox`: ArrowUp/ArrowDown move a
 * highlight through the results, Enter picks the highlighted city, Escape asks
 * the parent to close the panel. Focus never leaves the input — the highlight
 * is exposed through `aria-activedescendant` — so every key fires on one
 * element and a screen reader announces the highlighted city without a focus
 * jump. This component is not told which city is currently chosen (the parent
 * owns the location), so `aria-selected` marks the highlighted option, as the
 * APG does for a listbox popup.
 */
export default function CitySearch({ onSelect, onClose }: CitySearchProps) {
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  // Index into `results` of the highlighted city; -1 = nothing highlighted.
  const [activeIndex, setActiveIndex] = useState(-1)
  const listId = useId()
  const activeRef = useRef<HTMLButtonElement>(null)

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
  // The listbox exists only while there are options to put in it — the
  // loading / error / no-match lines are plain text, not listbox children.
  const hasOptions = results.length > 0
  const active: WeatherCity | undefined = results[activeIndex]
  const optionId = (index: number) => `${listId}-option-${index}`

  // Keep the highlighted row inside the list's scroll area. `query` is a
  // dependency too: typing resets the highlight to the first row even when it
  // already was the first row, and the list may have been wheel-scrolled since.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, query])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Keys that drive an IME composition (picking a candidate, Enter to commit
    // it) belong to the IME — Enter there must not also pick a city. Safari
    // fires `compositionend` before that committing keydown, so `isComposing`
    // is already false there; the event still reports keyCode 229.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hasOptions) return
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => Math.min(Math.max(i + step, 0), results.length - 1))
    } else if (e.key === 'Enter') {
      if (!active) return
      e.preventDefault()
      onSelect(active)
    } else if (e.key === 'Escape') {
      if (!onClose) return
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="wx-search-panel" role="search">
      <input
        className="wx-search-input"
        type="text"
        role="combobox"
        aria-expanded={hasOptions}
        aria-controls={hasOptions ? listId : undefined}
        aria-activedescendant={active ? optionId(activeIndex) : undefined}
        aria-autocomplete="list"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          // Typing highlights the best (first) match so Enter picks it. An empty
          // query highlights nothing, so opening the panel and pressing Enter
          // can't pick a city by accident.
          setActiveIndex(e.target.value.trim() === '' ? -1 : 0)
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search city or country code…"
        aria-label="Search city"
        // eslint-disable-next-line jsx-a11y/no-autofocus -- mounts only after the user opens search (Materialize show={searchOpen}), so focus lands where they asked
        autoFocus
      />
      <div id={listId} className="wx-search-list" role={hasOptions ? 'listbox' : 'group'} aria-label="City results">
        {catalog.status === 'loading' && <p className="wx-search-empty t-caption">Loading city list…</p>}
        {catalog.status === 'error' && (
          <p className="wx-search-empty t-caption">City list unavailable — try again in a moment.</p>
        )}
        {catalog.status === 'ready' && results.length === 0 && (
          <p className="wx-search-empty t-caption">No matching city.</p>
        )}
        {catalog.status === 'ready' &&
          results.map((city, index) => (
            <button
              key={`${city.name}-${city.countryCode}`}
              ref={index === activeIndex ? activeRef : undefined}
              id={optionId(index)}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              // Options are reached with the arrow keys from the input, not with Tab.
              tabIndex={-1}
              className={`wx-search-item${index === activeIndex ? ' is-active' : ''}`}
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
