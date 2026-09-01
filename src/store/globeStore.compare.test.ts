/**
 * globeStore — Compare tray slot logic. Pins the two branches the presentational
 * `CompareTray` component only reflects but doesn't decide: "first empty slot
 * (A) fills, then B fills, then a third pin replaces B while A stays put" (code
 * review Major-2, 2026-09-01). `differentNature` caveat coverage lives in
 * `chrome/CompareTray.test.tsx` — that's a rendering decision, not a store one.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useGlobeStore } from './globeStore'
import type { CompareSlot } from './globeStore'

const INITIAL = useGlobeStore.getState()

beforeEach(() => {
  useGlobeStore.setState(INITIAL, true)
})

function slot(id: string, overrides: Partial<CompareSlot> = {}): CompareSlot {
  return {
    id,
    label: id.toUpperCase(),
    value: 10,
    unit: 'µg/m³',
    layerLabel: 'PM2.5',
    timeLabel: 'NOW',
    grade: 'Good',
    nature: 'grid_snapshot',
    ...overrides,
  }
}

describe('globeStore — pinCompareSlot', () => {
  it('fills the first empty slot (A) when both slots start empty', () => {
    // Arrange / Act
    useGlobeStore.getState().pinCompareSlot(slot('seoul'))
    // Assert
    const [a, b] = useGlobeStore.getState().compareSlots
    expect(a?.id).toBe('seoul')
    expect(b).toBeNull()
  })

  it('fills B next, leaving A untouched, once A is already pinned', () => {
    // Arrange
    useGlobeStore.getState().pinCompareSlot(slot('seoul'))
    // Act
    useGlobeStore.getState().pinCompareSlot(slot('tokyo'))
    // Assert
    const [a, b] = useGlobeStore.getState().compareSlots
    expect(a?.id).toBe('seoul')
    expect(b?.id).toBe('tokyo')
  })

  it('replaces B (not A) when a third pin arrives with both slots already full', () => {
    // Arrange
    useGlobeStore.getState().pinCompareSlot(slot('seoul'))
    useGlobeStore.getState().pinCompareSlot(slot('tokyo'))
    // Act
    useGlobeStore.getState().pinCompareSlot(slot('sydney'))
    // Assert — A is the scene the user is actively looking at, so it stays put.
    const [a, b] = useGlobeStore.getState().compareSlots
    expect(a?.id).toBe('seoul')
    expect(b?.id).toBe('sydney')
  })

  it('keeps replacing only B on further pins (fourth pin does not touch A either)', () => {
    // Arrange
    useGlobeStore.getState().pinCompareSlot(slot('seoul'))
    useGlobeStore.getState().pinCompareSlot(slot('tokyo'))
    useGlobeStore.getState().pinCompareSlot(slot('sydney'))
    // Act
    useGlobeStore.getState().pinCompareSlot(slot('london'))
    // Assert
    const [a, b] = useGlobeStore.getState().compareSlots
    expect(a?.id).toBe('seoul')
    expect(b?.id).toBe('london')
  })
})

describe('globeStore — removeCompareSlot', () => {
  it('clears only the targeted index, leaving the other slot alone', () => {
    // Arrange
    useGlobeStore.getState().pinCompareSlot(slot('seoul'))
    useGlobeStore.getState().pinCompareSlot(slot('tokyo'))
    // Act
    useGlobeStore.getState().removeCompareSlot(0)
    // Assert
    const [a, b] = useGlobeStore.getState().compareSlots
    expect(a).toBeNull()
    expect(b?.id).toBe('tokyo')
  })

  it('freeing A means the next pin fills A again, not B', () => {
    // Arrange
    useGlobeStore.getState().pinCompareSlot(slot('seoul'))
    useGlobeStore.getState().pinCompareSlot(slot('tokyo'))
    useGlobeStore.getState().removeCompareSlot(0)
    // Act
    useGlobeStore.getState().pinCompareSlot(slot('sydney'))
    // Assert
    const [a, b] = useGlobeStore.getState().compareSlots
    expect(a?.id).toBe('sydney')
    expect(b?.id).toBe('tokyo')
  })
})
