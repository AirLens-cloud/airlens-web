/**
 * AtmosphericEvidenceCard — coverage for the layered information
 * architecture (2026-09 revision): the always-visible Layer 1 (name·unit·
 * status, big value + expected-range caption, compact band line, quality/
 * lineage line), the conditional Layer 2 caveats, the collapsed Layer 3
 * `<details>` for source/provenance, and the events-mode value swap. The
 * Glass-box honest-empty branch is a regression guard — Layer 1 must never
 * fabricate a value or a band.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import AtmosphericEvidenceCard, { type AtmosphericEvidenceCardProps } from './AtmosphericEvidenceCard'

afterEach(cleanup)

function baseProps(overrides: Partial<AtmosphericEvidenceCardProps> = {}): AtmosphericEvidenceCardProps {
  return {
    status: 'ready',
    statusLabel: 'READY',
    label: 'PM2.5',
    unit: 'µg/m³',
    indexLabel: '01',
    mode: 'live',
    focus: {
      label: 'Seoul Station',
      value: 34.2,
      unit: 'µg/m³',
      p10: 26.1,
      p90: 43.4,
      kind: 'observed',
      dqss: 82,
    },
    band: { low: 22, center: 48, high: 74 },
    dqssGrade: 'A',
    source: 'Sentinel-5P',
    referenceTimeLabel: 'Aug 26, 04:00 UTC',
    validTimeLabel: 'Aug 26, 05:00 UTC',
    provenance: ['observed', 'quality-controlled'],
    coverage: 'Seoul metro area',
    ...overrides,
  }
}

describe('AtmosphericEvidenceCard — Layer 1 (always visible)', () => {
  it('renders name·unit·status as one headline line', () => {
    // Arrange / Act
    render(<AtmosphericEvidenceCard {...baseProps()} />)
    // Assert
    const headline = document.querySelector('.atmos-headline')
    expect(headline?.textContent).toContain('Seoul Station')
    expect(headline?.textContent).toContain('µg/m³')
    expect(headline?.textContent).toContain('READY')
  })

  it('shows the big representative value with an expected-range caption', () => {
    // Arrange / Act
    render(<AtmosphericEvidenceCard {...baseProps()} />)
    // Assert
    expect(screen.getByText('34.2')).toBeTruthy()
    expect(screen.getByText(/Expected range 26\.1–43\.4/)).toBeTruthy()
  })

  it('renders the compact p10—p50—p90 band line, not a labeled p10/p50/p90 list', () => {
    // Arrange / Act
    render(<AtmosphericEvidenceCard {...baseProps()} />)
    // Assert
    expect(screen.getByText('26.1 — 34.2 — 43.4')).toBeTruthy()
    expect(screen.queryByText(/^p10/)).toBeNull()
  })

  it('shows the DQSS grade and the observation lineage tag on one quality line', () => {
    // Arrange / Act
    render(<AtmosphericEvidenceCard {...baseProps()} />)
    // Assert
    const qualityLine = document.querySelector('.atmos-quality-line')
    expect(qualityLine?.textContent).toContain('DQSS')
    expect(qualityLine?.textContent).toContain('A')
    expect(qualityLine?.textContent).toContain('OBSERVED')
  })

  it('suppresses the expected-range caption when the band was rejected (crossing quantiles) — no reversed range', () => {
    // Arrange — independent quantile regressors can cross (p10 > p90); the
    // view model then returns band=null, and Layer 1 must not leak the raw pair.
    const props = baseProps({ band: null })
    props.focus = { ...props.focus!, p10: 45.0, p90: 40.0 }
    // Act
    render(<AtmosphericEvidenceCard {...props} />)
    // Assert
    expect(screen.queryByText(/Expected range/)).toBeNull()
    expect(screen.getByText('No band — none generated')).toBeTruthy()
  })

  it('keeps the lineage tag visible when no DQSS/confidence grade was published', () => {
    // Arrange — stations without a DQSS score ship qualityGrade:null; the
    // OBSERVED/MODELED lineage still changes how the value reads.
    const props = baseProps({ dqssGrade: null })
    props.focus = { ...props.focus!, dqss: undefined, qualityGrade: null } as typeof props.focus
    // Act
    render(<AtmosphericEvidenceCard {...props} />)
    // Assert
    const qualityLine = document.querySelector('.atmos-quality-line')
    expect(qualityLine?.textContent).toContain('OBSERVED')
    expect(qualityLine?.textContent).not.toContain('DQSS')
  })

  it('falls back to the honest-empty prompt and "no band" message when nothing is selected — never fabricates a value', () => {
    // Arrange / Act
    render(<AtmosphericEvidenceCard {...baseProps({ focus: null, band: null, range: null, dqssGrade: null })} />)
    // Assert
    expect(screen.getByText(/Select a station, forecast marker, or country/)).toBeTruthy()
    expect(screen.getByText('No band — none generated')).toBeTruthy()
    expect(document.querySelector('.atmos-quality-line')).toBeNull()
  })

  it('reports "Not applicable" instead of "no band" when uncertainty does not apply to this mode', () => {
    // Arrange / Act
    render(<AtmosphericEvidenceCard {...baseProps({ band: null, uncertaintyMode: 'none' })} />)
    // Assert
    expect(screen.getByText('Not applicable')).toBeTruthy()
  })

  it('shows the numeric DQSS score only when the score is provenance-tagged "measured"', () => {
    // Arrange
    const props = baseProps()
    props.focus = { ...props.focus!, dqss: 82, dqssProvenance: 'measured' }
    // Act
    render(<AtmosphericEvidenceCard {...props} />)
    // Assert
    expect(screen.getByText('82/100')).toBeTruthy()
    expect(screen.queryByText('DQSS —')).toBeNull()
  })

  it('withholds both the numeric DQSS score and the letter grade when a score exists but is not provenance-tagged "measured"', () => {
    // Arrange — e.g. a 'seed' demo score, or no provenance declared at all
    // (undefined). `dqssGrade` is passed as null here too, mirroring
    // Globe.tsx:290's call site — it gates `dqssScoreToGrade()` on the same
    // provenance check, so a letter grade can never survive alongside a
    // withheld number ("DQSS B … DQSS —" self-contradiction, code review
    // 2026-09-03). The card itself only renders whatever qualityTag it's
    // given — this test pins the caller contract, not just the card in
    // isolation.
    const props = baseProps({ dqssGrade: null })
    props.focus = { ...props.focus!, dqss: 82, dqssProvenance: undefined, qualityGrade: null }
    // Act
    render(<AtmosphericEvidenceCard {...props} />)
    // Assert
    expect(screen.getByText('DQSS —')).toBeTruthy()
    expect(screen.queryByText('82/100')).toBeNull()
    const qualityLine = document.querySelector('.atmos-quality-line')
    expect(qualityLine?.querySelector('b')).toBeNull()
    expect(screen.queryByText('A')).toBeNull()
  })
})

describe('AtmosphericEvidenceCard — Layer 2 (conditional caveat)', () => {
  it('shows no caveat in plain live mode', () => {
    // Arrange / Act
    render(<AtmosphericEvidenceCard {...baseProps()} />)
    // Assert
    expect(document.querySelector('.atmos-caveat')).toBeNull()
  })

  it('surfaces the transport composite caveat only in transport mode', () => {
    // Arrange / Act
    render(<AtmosphericEvidenceCard {...baseProps({ mode: 'transport' })} />)
    // Assert
    expect(screen.getByText(/Not a chemical transport model/)).toBeTruthy()
  })

  it('surfaces the single-member forecast caveat only when forecast mode has no band', () => {
    // Arrange / Act
    render(<AtmosphericEvidenceCard {...baseProps({ mode: 'forecast', band: null })} />)
    // Assert
    expect(screen.getByText(/GEFS single-member forecast/)).toBeTruthy()
  })
})

describe('AtmosphericEvidenceCard — Layer 3 (collapsed details)', () => {
  it('shows the source as the always-visible summary line, collapsed by default', () => {
    // Arrange / Act
    render(<AtmosphericEvidenceCard {...baseProps()} />)
    // Assert
    const details = document.querySelector('.atmos-evidence-details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(screen.getByText(/Sentinel-5P/)).toBeTruthy()
  })

  it('keeps reference time, valid time, coverage, and full provenance tags inside the collapsed body', () => {
    // Arrange / Act
    render(<AtmosphericEvidenceCard {...baseProps()} />)
    // Assert
    const details = document.querySelector('.atmos-evidence-details') as HTMLDetailsElement
    expect(details.textContent).toContain('Aug 26, 04:00 UTC')
    expect(details.textContent).toContain('Aug 26, 05:00 UTC')
    expect(details.textContent).toContain('Seoul metro area')
    expect(screen.getByText('QUALITY-CONTROLLED')).toBeTruthy()
  })
})

describe('AtmosphericEvidenceCard — events mode', () => {
  it('replaces the value area with a total count and a per-type subtotal, keeping band/quality structure', () => {
    // Arrange / Act
    render(
      <AtmosphericEvidenceCard
        {...baseProps({
          mode: 'events',
          eventCoverage: { rendered: 18, published: 24, detected: 61 },
        })}
      />,
    )
    // Assert
    expect(screen.getByText('24')).toBeTruthy()
    expect(screen.getByText('events')).toBeTruthy()
    expect(screen.getByText(/Rendered 18 · Detected 61/)).toBeTruthy()
    // The events-only caveat about partial upstream volume still applies.
    expect(screen.getByText(/not the full upstream volume/)).toBeTruthy()
    // Band structure is skipped for the count-based events value, not fabricated.
    expect(document.querySelector('.atmos-band-compact')).toBeNull()
    expect(document.querySelector('.atmos-band-empty')).toBeNull()
  })
})
