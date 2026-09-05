/**
 * Initial-state defaults that other suites deliberately don't pin (they
 * `setState()` their own fixtures) — this file is the one place a default
 * value regression would actually be caught. Currently just the P0 fix
 * (01-ux-audit.md §2 #3 / §8 roadmap): the Globe stage used to boot with no
 * field on at all (`overlayType: 'none'`), so a first visit showed a bare
 * sphere. PM2.5 is the deck's one always-available field (station + grid),
 * so it's now the honest default.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useGlobeStore } from './globeStore'

const INITIAL = useGlobeStore.getState()

beforeEach(() => {
  useGlobeStore.setState(INITIAL, true)
})

describe('globeStore — initial state defaults', () => {
  it('boots with PM2.5 as the default field, not an empty stage', () => {
    // Arrange / Act — a fresh store, no store actions called yet.
    const { overlayType } = useGlobeStore.getState()
    // Assert
    expect(overlayType).toBe('pm25')
  })
})
