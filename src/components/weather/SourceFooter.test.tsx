/**
 * SourceFooter — the Conditions tab's source disclosure.
 *
 * The regression this file exists to catch: the footer crediting the whole
 * tab to the weather proxy again, when the Air quality line's PM2.5 comes
 * from the shared primary reading (GEFS analysis or CAMS forecast via HF,
 * W1b commit ③), not from Open-Meteo's proxy.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import SourceFooter from './SourceFooter'

afterEach(cleanup)

function footerLines(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.wx-footer__line')).map((el) => el.textContent ?? '')
}

describe('SourceFooter', () => {
  it('names the weather source and the PM2.5 source on separate lines', () => {
    // Arrange / Act
    const { container } = render(<SourceFooter fetchedAt={null} locationSource={null} />)
    const lines = footerLines(container)
    // Assert
    expect(lines).toContain('WEATHER — Open-Meteo, via the AirLens community proxy (30-min cache)')
    // A literal, not the imported constant — so crediting PM2.5 to the wrong
    // feed fails here even if the constant itself is changed.
    expect(lines).toContain('PM2.5 — GEFS-Aerosols grid analysis or Open-Meteo CAMS forecast (via HF live-data)')
  })

  it('never credits the PM2.5 reading to the Open-Meteo weather proxy', () => {
    // Arrange / Act
    const { container } = render(<SourceFooter fetchedAt={null} locationSource={null} />)
    const pm25Line = footerLines(container).find((line) => line.startsWith('PM2.5 —'))
    // Assert
    expect(pm25Line).toBeDefined()
    expect(pm25Line).not.toContain('community proxy')
  })

  it('labels the fetch time as the weather fetch and says so when nothing was fetched yet', () => {
    // Arrange / Act
    const { container } = render(<SourceFooter fetchedAt={null} locationSource={null} />)
    // Assert
    expect(footerLines(container)).toContain('WEATHER FETCHED — not yet fetched')
  })

  it('adds the location disclosure only once the location source is known', () => {
    // Arrange / Act
    const unresolved = footerLines(render(<SourceFooter fetchedAt={null} locationSource={null} />).container)
    cleanup()
    const resolved = footerLines(render(<SourceFooter fetchedAt={null} locationSource="default" />).container)
    // Assert
    expect(unresolved).toHaveLength(3)
    expect(resolved).toHaveLength(4)
    expect(resolved[3]).toContain('Seoul is shown')
  })
})
