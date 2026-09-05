/**
 * CountryFlag — same-origin SVG with an ISO-code fallback (AAA).
 *
 * jsdom never actually fetches the `<img>` src, so "the SVG is missing" is
 * simulated by firing the `error` event the browser would fire on a real
 * 404 — the same signal `onError` reacts to in production.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import CountryFlag from './CountryFlag'

afterEach(cleanup)

describe('CountryFlag — a 2-letter code', () => {
  it('renders the self-hosted SVG with an accessible alt text', () => {
    // Arrange / Act
    render(<CountryFlag countryCode="KR" countryName="South Korea" />)
    // Assert
    const img = screen.getByAltText('South Korea flag')
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe('/flags/4x3/kr.svg')
  })

  it('falls back to the ISO code badge when the SVG fails to load', () => {
    // Arrange — a code the catalogue has not shipped a flag for.
    render(<CountryFlag countryCode="ZZ" countryName="Testland" />)
    const img = screen.getByAltText('Testland flag')
    // Act — the 404 a country with no shipped SVG produces today.
    fireEvent.error(img)
    // Assert
    expect(screen.queryByAltText('Testland flag')).toBeNull()
    expect(screen.getByText('ZZ')).toBeTruthy()
  })

  it('resets a prior failure when the country changes, given the caller keys it by code', () => {
    // Arrange — AT fails first. A caller that shows more than one country in
    // the same JSX slot over time (the current selection) keys this
    // component by `countryCode`, exactly as AttHeadline and
    // CountryCombobox's field flag do — that key is what forces the fresh
    // mount; nothing inside this component resets itself on a prop change.
    const { rerender } = render(<CountryFlag key="AT" countryCode="AT" countryName="Austria" />)
    fireEvent.error(screen.getByAltText('Austria flag'))
    expect(screen.getByText('AT')).toBeTruthy()
    // Act — switch to a country that has not failed yet.
    rerender(<CountryFlag key="KR" countryCode="KR" countryName="South Korea" />)
    // Assert — KR gets its own attempt, not AT's stale failure.
    expect(screen.getByAltText('South Korea flag')).toBeTruthy()
  })
})

describe('CountryFlag — no usable ISO-2 code', () => {
  it('shows the code badge directly, without ever requesting an image', () => {
    // Arrange / Act — a 3-letter or unknown code has no `/flags/4x3/*.svg` entry.
    render(<CountryFlag countryCode="XKX" countryName="Kosovo" />)
    // Assert
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('XKX')).toBeTruthy()
  })
})
