/**
 * SdidChart — what gets shaded (AAA).
 *
 * One property carries the chart's honesty: the shaded area covers the
 * post-treatment gap and nothing else. Before the treatment year the gap is how
 * badly the synthetic control fit the country, and shading it would present fit
 * error as a policy effect.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import SdidChart from './SdidChart'
import type { SdidPoint } from '../../types/policy'

afterEach(cleanup)

const series: SdidPoint[] = [
  { year: 2016, observed: 26, synthetic: 26 },
  { year: 2017, observed: 25, synthetic: 25.4 },
  { year: 2018, observed: 23, synthetic: 24.6 },
  { year: 2019, observed: 21, synthetic: 23.5 },
]

describe('SdidChart — with a treatment year', () => {
  it('shades the post-treatment gap and marks the needle', () => {
    // Arrange / Act
    const { container } = render(<SdidChart series={series} treatmentYear={2018} />)
    // Assert
    expect(container.querySelectorAll('.ins-sdid-effect')).toHaveLength(1)
    expect(screen.getByText('TREATMENT 2018')).toBeTruthy()
  })

  it('marks the pre-treatment window as model fit, separately from the effect', () => {
    // Arrange / Act
    const { container } = render(<SdidChart series={series} treatmentYear={2018} />)
    // Assert — two different fills with two different legend entries.
    expect(container.querySelectorAll('.ins-sdid-fitband')).toHaveLength(1)
    expect(screen.getByText('Model fit window')).toBeTruthy()
    expect(screen.getByText('Estimated effect')).toBeTruthy()
  })

  it('says the pre-treatment gap carries no causal meaning', () => {
    render(<SdidChart series={series} treatmentYear={2018} />)
    expect(screen.getByText(/model fit error and carries no causal meaning/i)).toBeTruthy()
  })

  it('draws both curves', () => {
    const { container } = render(<SdidChart series={series} treatmentYear={2018} />)
    expect(container.querySelectorAll('.ins-sdid-line--observed')).toHaveLength(1)
    expect(container.querySelectorAll('.ins-sdid-line--synthetic')).toHaveLength(1)
  })
})

describe('SdidChart — without a treatment year', () => {
  it('shades nothing and calls the divergence descriptive', () => {
    // Arrange / Act
    const { container } = render(<SdidChart series={series} treatmentYear={null} />)
    // Assert
    expect(container.querySelectorAll('.ins-sdid-effect')).toHaveLength(0)
    expect(container.querySelectorAll('.ins-sdid-needle')).toHaveLength(0)
    expect(screen.getByText(/descriptive and not a causal effect/i)).toBeTruthy()
  })

  it('ignores a treatment year outside the series domain', () => {
    // Arrange — 2030 is past the last observation, so there is no boundary to draw.
    const { container } = render(<SdidChart series={series} treatmentYear={2030} />)
    // Assert
    expect(container.querySelectorAll('.ins-sdid-needle')).toHaveLength(0)
  })
})

describe('SdidChart — no curve', () => {
  it('says no counterfactual was published rather than drawing an empty axis', () => {
    render(<SdidChart series={undefined} treatmentYear={2018} />)
    expect(screen.getByText(/no counterfactual to draw/i)).toBeTruthy()
  })

  it('needs two usable points before it draws anything', () => {
    render(<SdidChart series={[series[0]]} treatmentYear={2018} />)
    expect(screen.getByText(/no counterfactual to draw/i)).toBeTruthy()
  })
})
