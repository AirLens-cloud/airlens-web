/**
 * CitySearch — the combobox + listbox keyboard pattern (AAA).
 *
 * Same ARIA 1.2 "focus stays on the input, highlight via
 * `aria-activedescendant`" model `CountryCombobox` already has, so what is
 * pinned here is the part a screen-reader or keyboard-only visitor depends on:
 * roles and states, ArrowUp/ArrowDown/Enter/Escape on the one input, and that
 * the old click-to-pick behaviour still works.
 *
 * `@testing-library/jest-dom` isn't set up in this repo (see
 * `GlobalNav.test.tsx`), so attribute checks read the DOM directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import CitySearch from './CitySearch'
import type { CitySearchProps } from './CitySearch'
import type { WeatherCity } from '../../lib/cityCatalog'

vi.mock('../../lib/cityCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/cityCatalog')>()
  return { ...actual, loadCityCatalog: vi.fn() }
})

import { loadCityCatalog } from '../../lib/cityCatalog'

const SEOUL: WeatherCity = { name: 'Seoul', lat: 37.57, lon: 126.98, countryCode: 'KR' }
const BUSAN: WeatherCity = { name: 'Busan', lat: 35.18, lon: 129.08, countryCode: 'KR' }
const TOKYO: WeatherCity = { name: 'Tokyo', lat: 35.68, lon: 139.69, countryCode: 'JP' }
const OSAKA: WeatherCity = { name: 'Osaka', lat: 34.69, lon: 135.5, countryCode: 'JP' }
const CITIES = [SEOUL, BUSAN, TOKYO, OSAKA]

// jsdom doesn't implement scrollIntoView — CitySearch calls it to keep the
// highlighted row inside the list's scroll area. Same stub as ChatPanel.test.tsx.
const scrollIntoView = vi.fn()

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

/** Render with the catalog loaded and wait until its options are on screen. */
async function renderLoaded(props: Partial<CitySearchProps> = {}) {
  vi.mocked(loadCityCatalog).mockResolvedValue(CITIES)
  const onSelect = vi.fn()
  render(<CitySearch onSelect={onSelect} {...props} />)
  await screen.findAllByRole('option')
  return { onSelect, input: screen.getByRole('combobox', { name: 'Search city' }) as HTMLInputElement }
}

function selectedStates(): (string | null)[] {
  return screen.getAllByRole('option').map((o) => o.getAttribute('aria-selected'))
}

describe('CitySearch — roles and states', () => {
  it('is a combobox that controls a listbox of options', async () => {
    // Arrange / Act
    const { input } = await renderLoaded()
    // Assert
    const listbox = screen.getByRole('listbox', { name: 'City results' })
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(input.getAttribute('aria-controls')).toBe(listbox.id)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'SeoulKR',
      'BusanKR',
      'TokyoJP',
      'OsakaJP',
    ])
  })

  it('highlights nothing until the visitor moves or types', async () => {
    // Arrange / Act
    const { input } = await renderLoaded()
    // Assert — an unprompted Enter must not be able to pick a city.
    expect(input.hasAttribute('aria-activedescendant')).toBe(false)
    expect(selectedStates()).toEqual(['false', 'false', 'false', 'false'])
  })

  it('keeps the options out of the Tab order — the arrow keys reach them from the input', async () => {
    // Arrange / Act
    await renderLoaded()
    // Assert
    expect(screen.getAllByRole('option').every((o) => o.tabIndex === -1)).toBe(true)
  })

  it('has no listbox, and reports itself collapsed, while the catalog is loading', () => {
    // Arrange / Act
    vi.mocked(loadCityCatalog).mockReturnValue(new Promise(() => {}))
    render(<CitySearch onSelect={vi.fn()} />)
    const input = screen.getByRole('combobox', { name: 'Search city' })
    // Assert
    expect(screen.getByText('Loading city list…')).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.hasAttribute('aria-controls')).toBe(false)
  })

  it('has no listbox when the catalog fails to load, and says so', async () => {
    // Arrange / Act
    vi.mocked(loadCityCatalog).mockRejectedValue(new Error('offline'))
    render(<CitySearch onSelect={vi.fn()} />)
    // Assert
    expect(await screen.findByText(/City list unavailable/)).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('false')
  })

  it('swaps the listbox for the no-match line when nothing matches, and the arrows do nothing', async () => {
    // Arrange
    const { input, onSelect } = await renderLoaded()
    // Act
    fireEvent.change(input, { target: { value: 'zzz' } })
    const arrowCancelled = !fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Assert
    expect(screen.getByText('No matching city.')).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.hasAttribute('aria-controls')).toBe(false)
    expect(input.hasAttribute('aria-activedescendant')).toBe(false)
    expect(arrowCancelled).toBe(false)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('CitySearch — arrow-key navigation', () => {
  it('ArrowDown highlights the first city, then moves down; ArrowUp moves back', async () => {
    // Arrange
    const { input } = await renderLoaded()
    const options = screen.getAllByRole('option')
    // Act / Assert — down
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id)
    expect(selectedStates()).toEqual(['true', 'false', 'false', 'false'])
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id)
    expect(selectedStates()).toEqual(['false', 'true', 'false', 'false'])
    // Act / Assert — up
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id)
    expect(selectedStates()).toEqual(['true', 'false', 'false', 'false'])
  })

  it('stops at the first and last result instead of wrapping', async () => {
    // Arrange
    const { input } = await renderLoaded()
    const options = screen.getAllByRole('option')
    // Act — one past the end, then all the way back and one past the start.
    for (let i = 0; i < CITIES.length + 1; i++) fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Assert
    expect(input.getAttribute('aria-activedescendant')).toBe(options[CITIES.length - 1].id)
    for (let i = 0; i < CITIES.length + 1; i++) fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id)
  })

  it('claims the arrow keys, so the caret does not also jump', async () => {
    // Arrange
    const { input } = await renderLoaded()
    // Act — `fireEvent` returns false when the event was cancelled.
    const downCancelled = !fireEvent.keyDown(input, { key: 'ArrowDown' })
    const upCancelled = !fireEvent.keyDown(input, { key: 'ArrowUp' })
    const letterCancelled = !fireEvent.keyDown(input, { key: 'a' })
    // Assert
    expect(downCancelled).toBe(true)
    expect(upCancelled).toBe(true)
    expect(letterCancelled).toBe(false)
  })

  it('scrolls the highlighted option into view', async () => {
    // Arrange
    const { input } = await renderLoaded()
    const options = screen.getAllByRole('option')
    // Act
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Assert
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(options[1])
  })

  it('scrolls again when typing leaves the highlight on the first row', async () => {
    // Arrange — "kr" highlights Seoul, so the highlight index is already 0.
    const { input } = await renderLoaded()
    fireEvent.change(input, { target: { value: 'kr' } })
    scrollIntoView.mockClear()
    // Act — the highlight stays 0 → 0, but the query (and so the list) changed.
    fireEvent.change(input, { target: { value: 'kr ' } })
    // Assert
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getAllByRole('option')[0])
  })

  it('leaves the arrow keys to the input method during an IME composition', async () => {
    // Arrange
    const { input } = await renderLoaded()
    // Act
    const cancelled = !fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true })
    // Assert
    expect(cancelled).toBe(false)
    expect(input.hasAttribute('aria-activedescendant')).toBe(false)
  })
})

describe('CitySearch — choosing a city', () => {
  it('Enter picks the highlighted city', async () => {
    // Arrange
    const { input, onSelect } = await renderLoaded()
    // Act
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Assert
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(BUSAN)
  })

  it('Enter does nothing while nothing is highlighted', async () => {
    // Arrange
    const { input, onSelect } = await renderLoaded()
    // Act
    const cancelled = !fireEvent.keyDown(input, { key: 'Enter' })
    // Assert
    expect(onSelect).not.toHaveBeenCalled()
    expect(cancelled).toBe(false)
  })

  it('typing filters the list and highlights the best match, so Enter picks it', async () => {
    // Arrange
    const { input, onSelect } = await renderLoaded()
    // Act
    fireEvent.change(input, { target: { value: 'tok' } })
    const options = screen.getAllByRole('option')
    // Assert — one match, already highlighted.
    expect(options).toHaveLength(1)
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id)
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(TOKYO)
  })

  it('typing again moves the highlight back to the first match', async () => {
    // Arrange — highlight Busan (second of the two Korean cities).
    const { input } = await renderLoaded()
    fireEvent.change(input, { target: { value: 'kr' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(selectedStates()).toEqual(['false', 'true'])
    // Act
    fireEvent.change(input, { target: { value: 'kr ' } })
    // Assert
    expect(selectedStates()).toEqual(['true', 'false'])
  })

  it('clearing the query takes the highlight away again', async () => {
    // Arrange
    const { input } = await renderLoaded()
    fireEvent.change(input, { target: { value: 'tok' } })
    expect(input.hasAttribute('aria-activedescendant')).toBe(true)
    // Act
    fireEvent.change(input, { target: { value: '' } })
    // Assert
    expect(input.hasAttribute('aria-activedescendant')).toBe(false)
    expect(screen.getAllByRole('option')).toHaveLength(CITIES.length)
  })

  it('does not treat the Enter that confirms an IME composition as a pick', async () => {
    // Arrange
    const { input, onSelect } = await renderLoaded()
    fireEvent.change(input, { target: { value: 'tok' } })
    // Act
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    // Assert
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('also ignores the committing Enter Safari reports as keyCode 229 with isComposing already false', async () => {
    // Arrange — Safari fires compositionend before this keydown, so the
    // composition flag is already off; only the legacy keyCode 229 gives it away.
    const { input, onSelect } = await renderLoaded()
    fireEvent.change(input, { target: { value: 'tok' } })
    // Act
    const cancelled = !fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: false })
    // Assert
    expect(onSelect).not.toHaveBeenCalled()
    expect(cancelled).toBe(false)
  })

  it('still picks a city on click', async () => {
    // Arrange
    const { onSelect } = await renderLoaded()
    // Act
    fireEvent.click(screen.getByRole('option', { name: /Tokyo/ }))
    // Assert
    expect(onSelect).toHaveBeenCalledWith(TOKYO)
  })
})

describe('CitySearch — Escape', () => {
  it('asks the parent to close the panel, without picking anything', async () => {
    // Arrange
    const onClose = vi.fn()
    const { input, onSelect } = await renderLoaded({ onClose })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Act
    fireEvent.keyDown(input, { key: 'Escape' })
    // Assert
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('is left alone when the parent gave no onClose', async () => {
    // Arrange
    const { input } = await renderLoaded()
    // Act
    const cancelled = !fireEvent.keyDown(input, { key: 'Escape' })
    // Assert — not swallowed, so an outer handler (e.g. a dialog) still sees it.
    expect(cancelled).toBe(false)
  })
})
