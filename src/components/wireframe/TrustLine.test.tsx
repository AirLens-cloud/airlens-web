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

  it('renders a real DQSS score as its grade badge, and the p10/p90 band, when both are available', () => {
    // Arrange / Act
    const { getByTestId } = render(
      <TrustLine
        ageMs={45 * 60_000}
        dqss={{ available: true, value: 78.4 }}
        uncertainty={{ available: true, p10: 30, p90: 55, unit: 'µg/m³' }}
      />,
    )
    // Assert
    const line = getByTestId('trust-line')
    const text = line.textContent ?? ''
    expect(text).toMatch(/obs age.*45m/)
    // 78.4 falls in the B band (65 ≤ score < 80) — shown as the badge, the
    // raw score only in the tooltip (F53).
    const badge = line.querySelector('.dqss-badge')
    expect(badge?.getAttribute('data-dqss')).toBe('B')
    expect(text).not.toMatch(/\/100/)
    // One "DQSS" label only: the line's own key, then the letter-only badge.
    expect(line.querySelector('.trust-line__graded .dqss-badge--compact')).not.toBeNull()
    expect(line.querySelectorAll('.dqss-badge-prefix')).toHaveLength(0)
    // The raw score stays reachable — tooltip and accessible name of a
    // focusable link to the DQSS methodology, not visible text.
    const graded = line.querySelector('a.trust-line__graded')
    expect(graded?.getAttribute('href')).toBe('/methodology#dqss')
    expect(graded?.getAttribute('title')).toBe('DQSS score 78/100')
    expect(graded?.getAttribute('aria-label')).toBe('DQSS score 78/100')
    expect(text).not.toMatch(/withheld/)
    expect(text).toMatch(/30\.0–55\.0 µg\/m³/)
  })

  it.each([
    [80, 'A', 80],
    [79.9, 'B', 79],
    [65, 'B', 65],
    [64.9, 'C', 64],
    [50, 'C', 50],
    [49.9, 'D', 49],
    [20, 'D', 20],
    [19.9, 'F', 19],
    [0, 'F', 0],
  ])('grades a DQSS score of %s as %s, and its tooltip never names a score across the cutoff (%s/100)', (value, grade, shown) => {
    // Arrange / Act
    const { getByTestId } = render(
      <TrustLine ageMs={60_000} dqss={{ available: true, value }} uncertainty={{ available: false }} />,
    )
    // Assert
    const line = getByTestId('trust-line')
    expect(line.querySelector('.dqss-badge')?.getAttribute('data-dqss')).toBe(grade)
    expect(line.querySelector('.trust-line__graded')?.getAttribute('title')).toBe(`DQSS score ${shown}/100`)
  })

  it('shows the unknown-grade badge, never a made-up grade, when an available score is not a finite number', () => {
    // Arrange / Act
    const { getByTestId } = render(
      <TrustLine ageMs={60_000} dqss={{ available: true, value: Number.NaN }} uncertainty={{ available: false }} />,
    )
    // Assert
    const line = getByTestId('trust-line')
    expect(line.querySelector('.dqss-badge')?.getAttribute('data-dqss')).toBe('unknown')
    expect(line.textContent).not.toMatch(/NaN/)
    expect(line.querySelector('.trust-line__graded')?.getAttribute('title')).toBe('DQSS score not available')
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

  it('renders no scope tag by default, and the given one when scopeLabel is set', () => {
    // Arrange / Act
    const unscoped = render(
      <TrustLine dqss={{ available: false, reason: 'n/a' }} uncertainty={{ available: false }} />,
    )
    const scoped = render(
      <TrustLine
        dqss={{ available: false, reason: 'n/a' }}
        uncertainty={{ available: false }}
        scopeLabel="THIS FORECAST"
      />,
    )
    // Assert
    expect(unscoped.container.querySelector('.trust-line__scope')).toBeNull()
    expect(scoped.container.querySelector('.trust-line__scope')?.textContent).toBe('THIS FORECAST')
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
