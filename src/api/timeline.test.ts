/**
 * api/timeline.ts — resolveFrame nearest-snap + fetchTimelineManifest offset
 * injection (AAA). Ported verbatim from AirLens-platform apps/web
 * `src/api/timeline.test.ts` (the source test never referenced Supabase, so
 * no adaptation was needed).
 *
 * Glass-box: GEFS single-member; no synthetic p10/p90 introduced.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolveFrame, type TimelineFrameMeta } from './timeline'

function frame(offsetHours: number, leadHours = Math.max(0, offsetHours)): TimelineFrameMeta {
  return {
    validTime: new Date(Date.now() + offsetHours * 3_600_000).toISOString(),
    leadHours,
    cycle: '2026-07-05T06:00:00Z',
    file: `pm25-off${offsetHours}.json`,
    offsetHours,
  }
}

const frames: TimelineFrameMeta[] = [-24, -12, -3, 0, 3, 12, 24].map((o) => frame(o))

describe('resolveFrame — nearest snap', () => {
  it('returns the exact frame when offsetHours matches a frame', () => {
    // Arrange (frames) / Act
    const r = resolveFrame(frames, 12)
    // Assert
    expect(r?.offsetHours).toBe(12)
  })

  it('returns the nearest frame when offsetHours falls between frames', () => {
    // Arrange / Act — 10 is closer to 12 than to 3
    const r = resolveFrame(frames, 10)
    // Assert
    expect(r?.offsetHours).toBe(12)
  })

  it('returns null for offset 0 (current-* live path is used instead)', () => {
    // Arrange / Act
    const r = resolveFrame(frames, 0)
    // Assert
    expect(r).toBeNull()
  })

  it('returns null for an empty frame list', () => {
    // Arrange / Act
    const r = resolveFrame([], 6)
    // Assert
    expect(r).toBeNull()
  })

  it('clamps an out-of-range offset to the nearest frame', () => {
    // Arrange / Act — +48 is beyond the +24 window
    const r = resolveFrame(frames, 48)
    // Assert
    expect(r?.offsetHours).toBe(24)
  })
})

describe('fetchTimelineManifest — offsetHours injection', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  it('injects offsetHours = round((validTime − now) / 1h) per frame', async () => {
    // Arrange — now anchor; frame +6h and −3h from now
    const now = Date.parse('2026-07-06T00:00:00Z')
    const manifest = {
      variable: 'pm2_5',
      source: 'NOAA GEFS-Aerosols',
      refTime: '2026-07-06T00:00:00Z',
      generatedAt: '2026-07-06T00:00:00Z',
      stepHours: 3,
      windowHours: 24,
      resolution: 2.0,
      frames: [
        { validTime: '2026-07-06T06:00:00Z', leadHours: 6, cycle: 'c', file: 'a.json' },
        { validTime: '2026-07-05T21:00:00Z', leadHours: 0, cycle: 'c', file: 'b.json' },
      ],
    }
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => manifest } as unknown as Response)
    const { fetchTimelineManifest } = await import('./timeline')
    // Act
    const result = await fetchTimelineManifest(now)
    // Assert
    expect(result).not.toBeNull()
    expect(result!.frames[0].offsetHours).toBe(6)
    expect(result!.frames[1].offsetHours).toBe(-3)
    expect(result!.stale).toBe(false)
  })

  it('flags stale when generatedAt is older than the 12h threshold', async () => {
    // Arrange — generatedAt 13h before now
    const now = Date.parse('2026-07-06T13:00:00Z')
    const manifest = {
      variable: 'pm2_5', source: 'NOAA GEFS-Aerosols', refTime: '2026-07-06T00:00:00Z',
      generatedAt: '2026-07-06T00:00:00Z', stepHours: 3, windowHours: 24, resolution: 2.0,
      frames: [{ validTime: '2026-07-06T00:00:00Z', leadHours: 0, cycle: 'c', file: 'a.json' }],
    }
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => manifest } as unknown as Response)
    const { fetchTimelineManifest } = await import('./timeline')
    // Act
    const result = await fetchTimelineManifest(now)
    // Assert
    expect(result!.stale).toBe(true)
  })

  it('returns null on a non-ok manifest response (slider disabled, no fabrication)', async () => {
    // Arrange
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)
    const { fetchTimelineManifest } = await import('./timeline')
    // Act
    const result = await fetchTimelineManifest(Date.now())
    // Assert
    expect(result).toBeNull()
  })
})
