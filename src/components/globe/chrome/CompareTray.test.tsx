/**
 * CompareTray — presentational rendering decisions: the honest dashed-empty
 * prompt when nothing is pinned, and the "different data nature" caveat when
 * the two pinned slots don't share an epistemic nature (§4.2). Slot-fill
 * ordering (first-empty-then-B, third-pin-replaces-B) is a store decision,
 * covered in `store/globeStore.compare.test.ts` (code review Major-2,
 * 2026-09-01).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import CompareTray from './CompareTray'
import type { CompareSlot } from '../../../store/globeStore'

afterEach(cleanup)

function slot(overrides: Partial<CompareSlot> = {}): CompareSlot {
  return {
    id: 'seoul',
    label: 'SEOUL',
    value: 16.4,
    unit: 'µg/m³',
    layerLabel: 'PM2.5',
    timeLabel: 'NOW',
    grade: 'Moderate',
    nature: 'grid_snapshot',
    ...overrides,
  }
}

describe('CompareTray — empty state', () => {
  it('renders the dashed empty-slot prompt for both A and B when nothing is pinned', () => {
    // Arrange / Act
    render(<CompareTray slots={[null, null]} currentSlot={null} onPinCurrent={() => {}} onRemove={() => {}} />)
    // Assert
    expect(screen.getAllByText(/EMPTY — PIN A SECOND SCENE \(TIME OR PLACE\) TO COMPARE/)).toHaveLength(2)
  })

  it('disables "Pin current scene" when there is nothing to pin', () => {
    // Arrange / Act
    render(<CompareTray slots={[null, null]} currentSlot={null} onPinCurrent={() => {}} onRemove={() => {}} />)
    // Assert
    const pin = screen.getByRole('button', { name: /Pin current scene/i }) as HTMLButtonElement
    expect(pin.disabled).toBe(true)
  })

  it('enables "Pin current scene" once a current cursor exists', () => {
    // Arrange / Act
    render(<CompareTray slots={[null, null]} currentSlot={slot()} onPinCurrent={() => {}} onRemove={() => {}} />)
    // Assert
    const pin = screen.getByRole('button', { name: /Pin current scene/i }) as HTMLButtonElement
    expect(pin.disabled).toBe(false)
  })
})

describe('CompareTray — differentNature caveat', () => {
  it('shows no caveat and no scale-lock note while only one slot is pinned', () => {
    // Arrange / Act
    render(<CompareTray slots={[slot(), null]} currentSlot={null} onPinCurrent={() => {}} onRemove={() => {}} />)
    // Assert
    expect(screen.queryByText(/Different data nature/)).toBeNull()
    expect(screen.queryByText(/SCALE LOCKED/)).toBeNull()
  })

  it('shows no caveat when both pinned slots share the same data nature', () => {
    // Arrange / Act
    render(
      <CompareTray
        slots={[slot({ id: 'a', nature: 'grid_snapshot' }), slot({ id: 'b', nature: 'grid_snapshot' })]}
        currentSlot={null}
        onPinCurrent={() => {}}
        onRemove={() => {}}
      />,
    )
    // Assert
    expect(screen.queryByText(/Different data nature/)).toBeNull()
    expect(screen.getByText(/SCALE LOCKED/)).toBeTruthy()
  })

  it('shows the "different data nature" caveat when the two pinned slots come from different natures', () => {
    // Arrange / Act
    render(
      <CompareTray
        slots={[slot({ id: 'a', nature: 'grid_snapshot' }), slot({ id: 'b', nature: 'city_prediction' })]}
        currentSlot={null}
        onPinCurrent={() => {}}
        onRemove={() => {}}
      />,
    )
    // Assert
    expect(screen.getByText(/Different data nature — grid_snapshot vs city_prediction\. Values shown as published, not reconciled\./)).toBeTruthy()
  })

  it('calls onRemove with the slot index when its Remove button is clicked', () => {
    // Arrange
    const onRemove = vi.fn<(index: 0 | 1) => void>()
    render(
      <CompareTray
        slots={[slot({ id: 'a' }), slot({ id: 'b' })]}
        currentSlot={null}
        onPinCurrent={() => {}}
        onRemove={onRemove}
      />,
    )
    // Act
    screen.getByRole('button', { name: 'Remove B' }).click()
    // Assert
    expect(onRemove).toHaveBeenCalledWith(1)
  })
})
