import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DottedMap } from './DottedMap'

// Auto-cleanup is not registered globally in this repo (vitest `globals: false`),
// so each render must be torn down explicitly — otherwise the second case finds
// two `application` containers.
afterEach(cleanup)

/**
 * CI gate for DottedMap's keyboard/focus path.
 *
 * The runtime proof (does the view actually move?) lives in
 * `tests/canvas/insights-canvas.webkit.spec.ts`, which is a MANUAL audit suite —
 * it is wired into no workflow. Without this file the a11y fix would ship with
 * zero automated protection, so these assertions cover the part jsdom can judge
 * honestly: the container is focusable, it is named, and the key handler claims
 * the keys it is supposed to own.
 *
 * jsdom has no 2D context, so DottedMap's render effect returns at its
 * `if (!ctx) return` guard and no frame is ever drawn. That is why the assertions
 * below stop at `defaultPrevented` — a handler that claims ArrowRight but does
 * nothing with it would still pass here, which is exactly the gap the WebKit
 * suite's luminance-diff assertion closes. Neither test is sufficient alone.
 *
 * Assertions are plain DOM checks rather than jest-dom matchers: this repo has
 * no `@testing-library/jest-dom` and no vitest setup file, and pulling one in
 * for four matchers is not worth a dependency.
 */
describe('DottedMap — keyboard and focus surface', () => {
  it('exposes a focusable, named application container', () => {
    render(<DottedMap markers={[]} className="test-map" />)

    const container = screen.getByRole('application')
    expect(container.getAttribute('tabindex')).toBe('0')
    expect(container.getAttribute('aria-label')).toBe('Air quality world map')
    expect(container.classList.contains('test-map')).toBe(true)

    // A <div> without tabindex cannot take focus at all — this is the property
    // that was missing and made the map keyboard-unreachable.
    container.focus()
    expect(document.activeElement).toBe(container)
  })

  it('lets the consumer supply a translated accessible name', () => {
    render(<DottedMap markers={[]} ariaLabel="지역 PM2.5 지도" />)
    expect(screen.getByRole('application').getAttribute('aria-label')).toBe('지역 PM2.5 지도')
  })

  it.each(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '0'])(
    'claims %s (preventDefault) so the page does not scroll instead',
    (key) => {
      render(<DottedMap markers={[]} />)
      const container = screen.getByRole('application')

      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      container.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
    },
  )

  it.each(['q', 'Enter', 'Tab', 'Escape'])(
    'leaves %s alone so it still reaches the page',
    (key) => {
      render(<DottedMap markers={[]} />)
      const container = screen.getByRole('application')

      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      container.dispatchEvent(event)

      // Tab in particular must stay unclaimed — swallowing it would trap focus
      // inside a map the user cannot leave.
      expect(event.defaultPrevented).toBe(false)
    },
  )
})
