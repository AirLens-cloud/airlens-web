// Trust Center is a discovery hub, not a merge of the pages it points to
// (page-specs/trust-center-and-legal.md §1, §10 acceptance test 2): it must
// never render a data value of its own — no AQI numbers, no source counts,
// no dataset counts. This pins that as a regression: any digit appearing in
// the rendered page would mean a value crept in.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Trust from './Trust'

afterEach(cleanup)

// Version markers like "V0.1 DRAFT" legitimately contain digits — the
// regression this guards against is a rendered *measurement*: a
// concentration, a count with a unit, or an AQI number standing in for
// live data. Section-ordinal glyphs (①-⑥) aren't ASCII digits either.
const DATA_VALUE_PATTERN = /\d+(\.\d+)?\s*(µg\/m³|ppm|%)|AQI\s*\d/i

describe('Trust', () => {
  it('renders the 6-section hub with no data values (concentration/count/AQI number)', () => {
    const { container } = render(<Trust />)
    expect(container.textContent).not.toMatch(DATA_VALUE_PATTERN)
  })

  it('routes each section to its own page rather than rendering that page\'s content', () => {
    const { getAllByRole } = render(<Trust />)
    const links = getAllByRole('link').map((el) => el.getAttribute('href'))
    expect(links).toEqual(
      expect.arrayContaining(['/data-sources', '/datasets', '/methodology', '/legal/model-card', '/probe']),
    )
  })

  it('does not consume EvidenceEnvelope UI (no dqss-badge / aqi-dot elements)', () => {
    const { container } = render(<Trust />)
    expect(container.querySelector('.dqss-badge')).toBeNull()
    expect(container.querySelector('.aqi-dot')).toBeNull()
  })
})
