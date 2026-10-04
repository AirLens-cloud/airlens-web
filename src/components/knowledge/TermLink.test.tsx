/**
 * TermLink — the inline glossary definition trigger.
 *
 * Regressions this file exists to catch (W1b ⑤ review, once TrustLine made
 * TermLink ship on Home, /today and Country pages):
 * - the popover, anchored at a trigger mid-row on a phone, running past the
 *   right edge (clipped definition + sideways page scroll);
 * - the popover being an unnamed `role="dialog"` (axe aria-dialog-name).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import TermLink from './TermLink'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(document.documentElement, 'clientWidth')
})

/** Fakes the layout jsdom does not have: the trigger's wrapper at `anchorLeft`, a popover `width` wide, a `viewport`-wide page. */
function fakeLayout(anchorLeft: number, width: number, viewport: number): void {
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: viewport })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('knowledge-termlink')) return DOMRect.fromRect({ x: anchorLeft, y: 0, width: 40, height: 18 })
    if (this.classList.contains('knowledge-termlink__popover')) return DOMRect.fromRect({ x: anchorLeft, y: 18, width, height: 200 })
    return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 })
  })
}

function openPopover(label: string): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: label }))
  return screen.getByRole('dialog')
}

describe('TermLink popover placement', () => {
  it('slides the popover left when its trigger sits too far right to fit', () => {
    // Arrange — the DQSS key on a 375px phone (x≈157, measured).
    fakeLayout(157, 280, 375)
    render(<TermLink termId="dqss">DQSS</TermLink>)
    // Act
    const popover = openPopover('DQSS')
    // Assert — ends 16px short of the edge: 157 − 78 + 280 = 359.
    expect(popover.style.left).toBe('-78px')
  })

  it('leaves a popover that already fits at its default anchor', () => {
    // Arrange
    fakeLayout(40, 280, 375)
    render(<TermLink termId="dqss">DQSS</TermLink>)
    // Act
    const popover = openPopover('DQSS')
    // Assert
    expect(popover.style.left).toBe('')
  })

  it('re-measures on every open, so a trigger that moved gets a fresh offset', () => {
    // Arrange — opened once far right, closed, then the trigger moved to a
    // spot that still overflows, by a different amount.
    fakeLayout(157, 280, 375)
    render(<TermLink termId="dqss">DQSS</TermLink>)
    expect(openPopover('DQSS').style.left).toBe('-78px')
    fireEvent.click(screen.getByRole('button', { name: 'DQSS' }))
    vi.restoreAllMocks()
    fakeLayout(120, 280, 375)
    // Act
    const popover = openPopover('DQSS')
    // Assert — 120 − 41 + 280 = 359: a fresh measurement, not the old −78.
    expect(popover.style.left).toBe('-41px')
  })

  it('re-places an open popover when the viewport resizes (a rotated phone)', () => {
    // Arrange — opened where it fits, then the layout changed under it.
    fakeLayout(40, 280, 375)
    render(<TermLink termId="dqss">DQSS</TermLink>)
    const popover = openPopover('DQSS')
    expect(popover.style.left).toBe('')
    vi.restoreAllMocks()
    fakeLayout(157, 280, 375)
    // Act
    fireEvent(window, new Event('resize'))
    // Assert
    expect(popover.style.left).toBe('-78px')
  })

  it('stops listening for resize once the popover closes', () => {
    // Arrange
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    render(<TermLink termId="dqss">DQSS</TermLink>)
    openPopover('DQSS')
    const placed = add.mock.calls.find(([type]) => type === 'resize')?.[1]
    // Act
    fireEvent.click(screen.getByRole('button', { name: 'DQSS' }))
    // Assert
    expect(placed).toBeTypeOf('function')
    expect(remove).toHaveBeenCalledWith('resize', placed)
  })
})

describe('TermLink popover accessibility', () => {
  it('names its dialog after the term it defines', () => {
    // Arrange
    render(<TermLink termId="dqss">DQSS</TermLink>)
    // Act
    const popover = openPopover('DQSS')
    // Assert
    const titleId = popover.getAttribute('aria-labelledby')
    expect(titleId).toBeTruthy()
    expect(document.getElementById(titleId as string)?.textContent).toBe('DQSS')
    expect(screen.getByRole('dialog', { name: 'DQSS' })).toBe(popover)
  })

  it('gives each instance its own dialog and title ids', () => {
    // Arrange
    render(
      <>
        <TermLink termId="dqss">first</TermLink>
        <TermLink termId="dqss">second</TermLink>
      </>,
    )
    // Act
    fireEvent.click(screen.getByRole('button', { name: 'first' }))
    fireEvent.click(screen.getByRole('button', { name: 'second' }))
    const dialogs = screen.getAllByRole('dialog')
    // Assert
    expect(dialogs).toHaveLength(2)
    expect(dialogs[0].id).not.toBe(dialogs[1].id)
    expect(dialogs[0].getAttribute('aria-labelledby')).not.toBe(dialogs[1].getAttribute('aria-labelledby'))
  })
})
