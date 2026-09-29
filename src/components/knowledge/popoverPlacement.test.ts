/**
 * popoverShiftPx — the regression this file exists to catch: TermLink's
 * 280px popover, anchored at a trigger mid-row on a 375px phone, running
 * past the right edge and scrolling the whole page sideways (W1b ⑤ review).
 */
import { describe, it, expect } from 'vitest'
import { popoverShiftPx, POPOVER_VIEWPORT_GAP_PX } from './popoverPlacement'

describe('popoverShiftPx', () => {
  it('leaves a popover that already fits where it is', () => {
    // Arrange / Act
    const shift = popoverShiftPx(40, 280, 375)
    // Assert
    expect(shift).toBe(0)
  })

  it('pulls a right-edge overflow back so the panel ends one gap short of the edge', () => {
    // Arrange — trigger at x=157 (the DQSS key on a 375px phone, measured).
    const anchorLeft = 157
    // Act
    const shift = popoverShiftPx(anchorLeft, 280, 375)
    // Assert
    expect(shift).toBe(-78)
    expect(anchorLeft + shift + 280).toBe(375 - POPOVER_VIEWPORT_GAP_PX)
  })

  it('pushes a panel that starts inside the left gap back out to the gap', () => {
    // Arrange / Act
    const shift = popoverShiftPx(4, 200, 375)
    // Assert
    expect(4 + shift).toBe(POPOVER_VIEWPORT_GAP_PX)
  })

  it('keeps the left edge on screen when the panel is wider than the room', () => {
    // Arrange — 400px panel on a 360px viewport: it cannot fit both edges.
    // Act
    const shift = popoverShiftPx(120, 400, 360)
    // Assert
    expect(120 + shift).toBe(POPOVER_VIEWPORT_GAP_PX)
  })

  it('does nothing when there is no layout to measure', () => {
    // Arrange / Act / Assert — jsdom reports 0 for every size.
    expect(popoverShiftPx(0, 0, 0)).toBe(0)
    expect(popoverShiftPx(200, 280, 0)).toBe(0)
    expect(popoverShiftPx(200, 0, 375)).toBe(0)
  })

  it('defaults its gap to 16px, the --sp-4 the stylesheet pairs it with', () => {
    // Assert
    expect(POPOVER_VIEWPORT_GAP_PX).toBe(16)
  })
})
