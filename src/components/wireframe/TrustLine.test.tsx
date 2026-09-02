import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import TrustLine from './TrustLine'

afterEach(() => cleanup())

describe('TrustLine', () => {
  it('renders formatted age, withheld DQSS with its reason, and unpublished uncertainty', () => {
    // Arrange / Act
    const { getByTestId } = render(
      <TrustLine
        ageMs={2.3 * 3600_000}
        dqss={{ available: false, reason: 'not measured' }}
        uncertainty={{ available: false, reason: 'deterministic source' }}
      />,
    )
    // Assert
    const text = getByTestId('trust-line').textContent ?? ''
    expect(text).toMatch(/obs age.*2\.3h/)
    expect(text).toMatch(/DQSS.*withheld \(not measured\)/)
    expect(text).toMatch(/not published \(deterministic source\)/)
    expect(text).toMatch(/Why this number\?/)
  })

  it('renders a real DQSS score and p10/p90 band when both are available', () => {
    // Arrange / Act
    const { getByTestId } = render(
      <TrustLine
        ageMs={45 * 60_000}
        dqss={{ available: true, value: 78.4 }}
        uncertainty={{ available: true, p10: 30, p90: 55, unit: 'µg/m³' }}
      />,
    )
    // Assert
    const text = getByTestId('trust-line').textContent ?? ''
    expect(text).toMatch(/obs age.*45m/)
    expect(text).toMatch(/DQSS.*78\/100/)
    expect(text).toMatch(/30\.0–55\.0 µg\/m³/)
  })

  it('honors an explicit ageLabel over a computed ms value (annual-aggregate surfaces)', () => {
    // Arrange / Act
    const { getByTestId } = render(
      <TrustLine
        ageLabel="as of 2024"
        dqss={{ available: false, reason: 'not computed for this data source' }}
        uncertainty={{ available: false }}
      />,
    )
    // Assert
    expect(getByTestId('trust-line').textContent).toMatch(/obs age.*as of 2024/)
  })

  it('shows "unknown" (never a fabricated age) when neither ageMs nor ageLabel is given', () => {
    // Arrange / Act
    const { getByTestId } = render(
      <TrustLine dqss={{ available: false, reason: 'n/a' }} uncertainty={{ available: false }} />,
    )
    // Assert
    expect(getByTestId('trust-line').textContent).toMatch(/obs age.*unknown/)
  })

  it('links "Why this number?" to /methodology by default, or a custom href when given', () => {
    // Arrange / Act
    const defaultLink = render(
      <TrustLine dqss={{ available: false, reason: 'n/a' }} uncertainty={{ available: false }} />,
    )
    const customLink = render(
      <TrustLine
        dqss={{ available: false, reason: 'n/a' }}
        uncertainty={{ available: false }}
        methodologyHref="/methodology#dqss"
      />,
    )
    // Assert — `render()`'s bound queries search the whole `document.body`,
    // not just their own container, so with two renders live at once we must
    // scope through each result's own `container` instead.
    expect(defaultLink.container.querySelector('a')?.getAttribute('href')).toBe('/methodology')
    expect(customLink.container.querySelector('a')?.getAttribute('href')).toBe('/methodology#dqss')
  })
})
