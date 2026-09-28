// F51 — AqiCapsule's "Next forecast refresh in ..." countdown must carry
// minutes to hours past 60 minutes (REFRESH_INTERVAL_MS is 6h, so the raw
// input can be up to 360 minutes). Before this fix, `formatCountdown` never
// carried and rendered nonsense like "228:15" — see the header comment on
// the function itself (formatCountdown.ts) for the full incident.
import { describe, it, expect } from 'vitest'
import { formatCountdown } from './formatCountdown'

describe('formatCountdown', () => {
  it('renders "m:ss" for under 60 minutes', () => {
    // Arrange / Act / Assert
    expect(formatCountdown(5 * 60 * 1000 + 15 * 1000)).toBe('5:15')
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(59 * 60 * 1000 + 59 * 1000)).toBe('59:59')
  })

  it('carries to "Xh Ym" at 60 minutes and above', () => {
    // Arrange / Act / Assert — the reported incident: 228 minutes 15 seconds
    // used to render "228:15"; it must now carry to hours.
    expect(formatCountdown(228 * 60 * 1000 + 15 * 1000)).toBe('3h 48m')
    expect(formatCountdown(60 * 60 * 1000)).toBe('1h 0m')
    // REFRESH_INTERVAL_MS's own ceiling (6h) — the widest real input.
    expect(formatCountdown(6 * 60 * 60 * 1000)).toBe('6h 0m')
  })

  it('clamps negative input to zero instead of going negative', () => {
    // Arrange / Act / Assert
    expect(formatCountdown(-1000)).toBe('0:00')
  })
})
