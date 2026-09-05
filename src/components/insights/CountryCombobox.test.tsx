/**
 * CountryCombobox — the search-and-select popup that replaced the plain
 * `<select>` (AAA).
 *
 * Covers what the native element could not do: filter by typed text,
 * region grouping, the "significant only" filter, keyboard selection, and
 * remembering the last few picks across mounts (localStorage).
 *
 * `@testing-library/jest-dom` isn't set up in this repo (see
 * `GlobalNav.test.tsx`), so value/text checks read the DOM directly rather
 * than using `toHaveValue()`/`toHaveTextContent()`.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import CountryCombobox from './CountryCombobox'
import type { AnalysedCountry } from '../../hooks/useInsightsData'

// jsdom in this repo does not implement `window.localStorage` (documented in
// `store/locationChoiceStore.test.ts`) — a memory-backed stand-in is swapped
// in for the "RECENT" recall test and restored afterward.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

let originalDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  Object.defineProperty(window, 'localStorage', { value: createMemoryStorage(), configurable: true })
})

afterEach(() => {
  cleanup()
  if (originalDescriptor) Object.defineProperty(window, 'localStorage', originalDescriptor)
})

function row(over: Partial<AnalysedCountry['summary']> = {}): AnalysedCountry['summary'] {
  return {
    countryCode: 'XX',
    att: -1,
    ci_low: -2,
    ci_high: 0,
    p_value: 0.02,
    significant: true,
    status: 'ok',
    treatmentYear: 2019,
    panelSource: 'acag_v6_ground_cal',
    fitScore: 80,
    hasCrossCheck: true,
    ...over,
  }
}

const COUNTRIES: AnalysedCountry[] = [
  { countryCode: 'KR', name: 'South Korea', flag: '🇰🇷', region: 'East Asia', pm25AnnualStandard: 15, summary: row({ countryCode: 'KR' }) },
  { countryCode: 'JP', name: 'Japan', flag: '🇯🇵', region: 'East Asia', pm25AnnualStandard: 15, summary: row({ countryCode: 'JP', significant: false }) },
  { countryCode: 'AT', name: 'Austria', flag: '🇦🇹', region: 'Europe', pm25AnnualStandard: 20, summary: row({ countryCode: 'AT' }) },
  { countryCode: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', region: 'Middle East', pm25AnnualStandard: null, summary: row({ countryCode: 'AE', att: null, significant: false }) },
]

describe('CountryCombobox — the closed field', () => {
  it('shows the currently selected country as its value', () => {
    // Arrange / Act
    render(<CountryCombobox countries={COUNTRIES} selectedCode="KR" onSelect={() => {}} />)
    // Assert
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('South Korea')
  })
})

describe('CountryCombobox — typing a query', () => {
  it('filters to countries whose name or code matches', () => {
    // Arrange
    render(<CountryCombobox countries={COUNTRIES} selectedCode="KR" onSelect={() => {}} />)
    const input = screen.getByRole('combobox')
    // Act
    fireEvent.change(input, { target: { value: 'jap' } })
    // Assert
    expect(screen.getByRole('option').textContent).toContain('Japan')
    expect(screen.queryByText('Austria')).toBeNull()
  })

  it('groups the visible options by region', () => {
    render(<CountryCombobox countries={COUNTRIES} selectedCode="KR" onSelect={() => {}} />)
    fireEvent.focus(screen.getByRole('combobox'))
    expect(screen.getByText('EAST ASIA')).toBeTruthy()
    expect(screen.getByText('EUROPE')).toBeTruthy()
  })

  it('marks a gated country as not estimated, matching the text the old select used', () => {
    // Arrange — AE never got an SDID estimate.
    render(<CountryCombobox countries={COUNTRIES} selectedCode="KR" onSelect={() => {}} />)
    // Act
    fireEvent.focus(screen.getByRole('combobox'))
    // Assert
    expect(screen.getByText(/United Arab Emirates — not estimated/)).toBeTruthy()
  })
})

describe('CountryCombobox — the significant-only filter', () => {
  it('hides non-significant countries once toggled on', () => {
    // Arrange
    render(<CountryCombobox countries={COUNTRIES} selectedCode="KR" onSelect={() => {}} />)
    fireEvent.focus(screen.getByRole('combobox'))
    // Act — JP and AE are not significant.
    fireEvent.click(screen.getByLabelText('SIGNIFICANT ONLY'))
    // Assert
    expect(screen.queryByText('Japan')).toBeNull()
    expect(screen.getByText('South Korea')).toBeTruthy()
  })
})

describe('CountryCombobox — selecting a country', () => {
  it('calls onSelect and closes when an option is clicked', () => {
    // Arrange
    const picks: string[] = []
    render(<CountryCombobox countries={COUNTRIES} selectedCode="KR" onSelect={(c) => picks.push(c)} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Austria' } })
    // Act
    fireEvent.click(screen.getByRole('option'))
    // Assert
    expect(picks).toEqual(['AT'])
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('selects the highlighted option on ArrowDown then Enter', () => {
    // Arrange — filter down to exactly one, so ArrowDown's landing spot is unambiguous.
    const picks: string[] = []
    render(<CountryCombobox countries={COUNTRIES} selectedCode="KR" onSelect={(c) => picks.push(c)} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Austria' } })
    // Act
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Assert
    expect(picks).toEqual(['AT'])
  })

  it('closes on Escape without selecting anything', () => {
    // Arrange
    const picks: string[] = []
    render(<CountryCombobox countries={COUNTRIES} selectedCode="KR" onSelect={(c) => picks.push(c)} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    // Act
    fireEvent.keyDown(input, { key: 'Escape' })
    // Assert
    expect(picks).toEqual([])
    expect(screen.queryByRole('listbox')).toBeNull()
    expect((input as HTMLInputElement).value).toBe('South Korea')
  })

  it('remembers the pick as RECENT the next time the popup opens', () => {
    // Arrange
    render(<CountryCombobox countries={COUNTRIES} selectedCode="KR" onSelect={() => {}} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Austria' } })
    fireEvent.click(screen.getByRole('option'))
    // Act — reopen with an empty query.
    fireEvent.focus(screen.getByRole('combobox'))
    // Assert
    expect(screen.getByText('RECENT')).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem('airlens:insights:recent-countries') ?? '[]')).toEqual(['AT'])
  })
})
