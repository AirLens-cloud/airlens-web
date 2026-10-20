import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import WfTimelineScrubber from './WfTimelineScrubber'

afterEach(cleanup)

// Deliberately unsorted so that every case below fails if the keyboard path
// stops ordering the real snap points itself (array order gives 24 / -24 /
// -12 / 12 instead of the expected neighbours and ends).
function renderTrack(offset: number) {
  const onScrub = vi.fn()
  render(<WfTimelineScrubber track={{ min: -24, max: 24, offset, snapPoints: [-12, 24, 0, -24, 12], onScrub }} />)
  return { onScrub, slider: screen.getByRole('slider') }
}

describe('WfTimelineScrubber track-mode slider knob', () => {
  it('is reachable by Tab (tabIndex 0)', () => {
    // Arrange / Act
    const { slider } = renderTrack(0)
    // Assert
    expect(slider.tabIndex).toBe(0)
  })

  it('steps to the next real snap point above the offset on ArrowRight', () => {
    // Arrange
    const { onScrub, slider } = renderTrack(0)
    // Act
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    // Assert
    expect(onScrub).toHaveBeenCalledTimes(1)
    expect(onScrub).toHaveBeenCalledWith(12)
  })

  it('steps to the next real snap point below the offset on ArrowLeft', () => {
    // Arrange
    const { onScrub, slider } = renderTrack(0)
    // Act
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    // Assert
    expect(onScrub).toHaveBeenCalledTimes(1)
    expect(onScrub).toHaveBeenCalledWith(-12)
  })

  it('jumps to the lowest snap point on Home', () => {
    // Arrange
    const { onScrub, slider } = renderTrack(0)
    // Act
    fireEvent.keyDown(slider, { key: 'Home' })
    // Assert
    expect(onScrub).toHaveBeenCalledTimes(1)
    expect(onScrub).toHaveBeenCalledWith(-24)
  })

  it('jumps to the highest snap point on End', () => {
    // Arrange
    const { onScrub, slider } = renderTrack(0)
    // Act
    fireEvent.keyDown(slider, { key: 'End' })
    // Assert
    expect(onScrub).toHaveBeenCalledTimes(1)
    expect(onScrub).toHaveBeenCalledWith(24)
  })

  it.each(['ArrowRight', 'End'])('does not scrub on %s when already at the highest snap point', (key) => {
    // Arrange
    const { onScrub, slider } = renderTrack(24)
    // Act
    fireEvent.keyDown(slider, { key })
    // Assert
    expect(onScrub).not.toHaveBeenCalled()
  })

  it.each(['ArrowLeft', 'ArrowDown', 'Home'])('does not scrub on %s when already at the lowest snap point', (key) => {
    // Arrange
    const { onScrub, slider } = renderTrack(-24)
    // Act
    fireEvent.keyDown(slider, { key })
    // Assert
    expect(onScrub).not.toHaveBeenCalled()
  })

  it.each([
    { key: 'ArrowUp', expected: 12 },
    { key: 'ArrowDown', expected: -12 },
  ])('treats $key like the matching horizontal arrow', ({ key, expected }) => {
    // Arrange
    const { onScrub, slider } = renderTrack(0)
    // Act
    fireEvent.keyDown(slider, { key })
    // Assert
    expect(onScrub).toHaveBeenCalledWith(expected)
  })

  it('steps from an offset between snap points to the neighbouring real points', () => {
    // Arrange
    const { onScrub, slider } = renderTrack(5)
    // Act
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    // Assert
    expect(onScrub.mock.calls).toEqual([[12], [0]])
  })

  it.each([
    { name: 'Tab', init: { key: 'Tab' } },
    { name: 'Alt+ArrowLeft', init: { key: 'ArrowLeft', altKey: true } },
    { name: 'Ctrl+ArrowRight', init: { key: 'ArrowRight', ctrlKey: true } },
    { name: 'Meta+ArrowRight', init: { key: 'ArrowRight', metaKey: true } },
  ])('leaves $name to the browser', ({ init }) => {
    // Arrange
    const { onScrub, slider } = renderTrack(0)
    // Act
    const notCancelled = fireEvent.keyDown(slider, init)
    // Assert
    expect(notCancelled).toBe(true)
    expect(onScrub).not.toHaveBeenCalled()
  })

  it('exposes valueLabel as aria-valuetext', () => {
    // Arrange / Act
    render(<WfTimelineScrubber track={{ min: -24, max: 24, offset: 0, snapPoints: [0], onScrub: vi.fn(), valueLabel: 'Forecast - valid 14:00' }} />)
    // Assert
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('Forecast - valid 14:00')
  })

  it('is not a Tab stop and ignores keys when there are no snap points', () => {
    // Arrange
    const onScrub = vi.fn()
    render(<WfTimelineScrubber track={{ min: -24, max: 24, offset: 0, snapPoints: [], onScrub }} />)
    const slider = screen.getByRole('slider')
    // Act
    fireEvent.keyDown(slider, { key: 'End' })
    // Assert
    expect(slider.tabIndex).toBe(-1)
    expect(slider.getAttribute('aria-disabled')).toBe('true')
    expect(onScrub).not.toHaveBeenCalled()
  })
})
