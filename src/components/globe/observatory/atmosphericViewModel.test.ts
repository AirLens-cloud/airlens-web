import { describe, expect, it } from 'vitest'
import type { AtmosphericViewState } from './atmosphericViewModel'
import { buildAtmosphericViewModel, deriveAtmosphericMode, scaleUncertaintyBand } from './atmosphericViewModel'

const BASE: AtmosphericViewState = {
  overlayType: 'none',
  activeGridMeta: null,
  timeOffsetHours: 0,
  timelineStale: false,
  timelinePlaying: false,
  transportLens: false,
  showParticles: true,
  showStations: true,
  showFires: false,
  showChoropleth: false,
  selectedStation: null,
  selectedPrediction: null,
  selectedCountry: null,
  fireCoverage: null,
  windFieldStatus: 'ready',
  windFieldMeta: {
    level: 'surface',
    refTime: '2026-08-20T18:00:00Z',
    generatedAt: '2026-08-20T19:00:00Z',
    resolution: 1,
  },
}

describe('atmosphericViewModel', () => {
  it('derives mutually exclusive modes from the layers that are actually active', () => {
    expect(deriveAtmosphericMode(BASE)).toBe('live')
    expect(deriveAtmosphericMode({ ...BASE, showFires: true })).toBe('events')
    expect(deriveAtmosphericMode({ ...BASE, showChoropleth: true })).toBe('policy')
    expect(deriveAtmosphericMode({ ...BASE, overlayType: 'pm25', timeOffsetHours: 3 })).toBe('forecast')
    expect(deriveAtmosphericMode({ ...BASE, transportLens: true, showFires: true })).toBe('transport')
  })

  it('maps a rendered GEFS frame to forecast motion without inventing a band', () => {
    const view = buildAtmosphericViewModel({
      ...BASE,
      overlayType: 'pm25',
      timeOffsetHours: 3,
      activeGridMeta: {
        overlayType: 'pm25', source: 'NOAA GEFS-Aerosols', timestamp: 1,
        min: 2, max: 91, leadHours: 9, validTime: 2, cycle: '2026-08-20T12:00:00Z',
      },
    })

    expect(view.mode).toBe('forecast')
    expect(view.motion).toBe('time-scrub')
    expect(view.provenance).toContain('model-forecast')
    expect(view.range).toEqual([2, 91])
    expect(view.uncertainty).toBe('explicit-caveat')
    expect(view.status).toBe('ready')
  })

  it('keeps actual fire truncation counts attached to the events evidence', () => {
    const view = buildAtmosphericViewModel({
      ...BASE,
      showFires: true,
      showParticles: false,
      fireCoverage: {
        rendered: 1000, published: 1800, detected: 5300, capped: true,
        minFrpPublished: 4.2, refTime: '2026-08-20T18:00:00Z', ageHours: 2, stale: false,
      },
    })

    expect(view.mode).toBe('events')
    expect(view.motion).toBe('pulse')
    expect(view.eventCoverage).toMatchObject({ rendered: 1000, published: 1800, detected: 5300 })
  })

  it('does not attribute grid provenance or timestamps to a selected station', () => {
    const view = buildAtmosphericViewModel({
      ...BASE,
      overlayType: 'pm25',
      activeGridMeta: { overlayType: 'pm25', source: 'Grid source', timestamp: 99, min: 1, max: 2 },
      selectedStation: { lat: 37.5, lon: 127, pm25: 18, name: 'Station without source' },
    })

    expect(view.provenance).toEqual(['observed'])
    expect(view.source).toBeNull()
    expect(view.referenceTime).toBeNull()
    expect(view.validTime).toBeNull()
  })

  it('passes the selected station\'s dqss_provenance through to focus.dqssProvenance', () => {
    const measured = buildAtmosphericViewModel({
      ...BASE,
      selectedStation: { lat: 37.5, lon: 127, pm25: 18, name: 'Measured station', dqss: 82, dqss_provenance: 'measured' },
    })
    expect(measured.focus).toMatchObject({ dqss: 82, dqssProvenance: 'measured' })

    const seeded = buildAtmosphericViewModel({
      ...BASE,
      selectedStation: { lat: 37.5, lon: 127, pm25: 18, name: 'Seeded station', dqss: 82, dqss_provenance: 'seed' },
    })
    expect(seeded.focus).toMatchObject({ dqss: 82, dqssProvenance: 'seed' })

    const undeclared = buildAtmosphericViewModel({
      ...BASE,
      selectedStation: { lat: 37.5, lon: 127, pm25: 18, name: 'No provenance declared', dqss: 82 },
    })
    expect(undeclared.focus).toMatchObject({ dqss: 82, dqssProvenance: null })
  })

  it('builds a scaled band only from ordered, finite real quantiles', () => {
    expect(scaleUncertaintyBand(10, 20, 40)).toMatchObject({ low: expect.any(Number), center: expect.any(Number), high: expect.any(Number) })
    expect(scaleUncertaintyBand(30, 20, 40)).toBeNull()
    expect(scaleUncertaintyBand(null, 20, 40)).toBeNull()
  })

  it('treats a selected prediction as a model estimate with its real interval and version', () => {
    const view = buildAtmosphericViewModel({
      ...BASE,
      selectedPrediction: {
        name: 'Seoul model cell', lat: 37.5, lon: 127, p10: 12, p50: 24, p90: 48,
        source: 'AirLens TFT-Q', modelVersion: 'tft-q-2.1', confidenceGrade: 'B',
      },
    })

    expect(view.focus).toMatchObject({ kind: 'model-estimate', p10: 12, value: 24, p90: 48, version: 'tft-q-2.1' })
    expect(view.uncertainty).toBe('band-if-available')
  })
})
