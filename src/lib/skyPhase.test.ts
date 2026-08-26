import { describe, it, expect } from 'vitest'
import { skyPhaseAtLongitude, skyPhaseForWeatherAt } from './skyPhase'

describe('skyPhaseAtLongitude', () => {
  it('resolves noon at UTC longitude 0, 12:00 UTC', () => {
    const date = new Date('2026-08-26T12:00:00Z')
    expect(skyPhaseAtLongitude(0, date)).toBe('noon')
  })

  it('shifts to night for a longitude far east at UTC noon (evening there)', () => {
    // 12:00 UTC + 135/15 = 9h -> 21:00 local solar time.
    const date = new Date('2026-08-26T12:00:00Z')
    expect(skyPhaseAtLongitude(135, date)).toBe('night')
  })

  it('wraps solar time into [0, 24) for an extreme west longitude', () => {
    // 00:30 UTC + (-179)/15 ~= -11.9h -> wraps to ~12.6h local -> noon.
    const date = new Date('2026-08-26T00:30:00Z')
    const phase = skyPhaseAtLongitude(-179, date)
    expect(['noon', 'dusk']).toContain(phase)
  })
})

describe('skyPhaseForWeatherAt', () => {
  it('resolves clear weather to the time-of-day phase at that longitude', () => {
    const date = new Date('2026-08-26T12:00:00Z')
    expect(skyPhaseForWeatherAt(0, 0, date)).toBe('noon')
  })

  it('lets a non-clear condition override the time-of-day phase', () => {
    const date = new Date('2026-08-26T12:00:00Z') // noon at lon 0
    expect(skyPhaseForWeatherAt(96, 0, date)).toBe('thunder') // thunderstorm code
  })

  it('treats a missing weather code as clear, deferring to solar time', () => {
    const date = new Date('2026-08-26T12:00:00Z')
    expect(skyPhaseForWeatherAt(null, 0, date)).toBe('noon')
  })
})
