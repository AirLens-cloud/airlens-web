import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import Materialize from './Materialize'

beforeEach(() => {
  // rAF stub, same pattern as the landing scene tests (queueMicrotask so it
  // settles without depending on real animation-frame timing in CI).
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queueMicrotask(() => cb(0))
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  // jsdom in this repo's vitest config has no `matchMedia` — Materialize
  // calls useReducedMotion() unconditionally, so the stub is needed here too.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Materialize', () => {
  it('renders nothing while closed', () => {
    // Arrange / Act
    const { container } = render(<Materialize show={false}>content</Materialize>)
    // Assert
    expect(container.firstChild).toBeNull()
  })

  it('mounts closed then adds the entered class one frame after opening', async () => {
    // Arrange
    const { container, rerender } = render(<Materialize show={false}>content</Materialize>)
    // Act
    rerender(<Materialize show>content</Materialize>)
    const el = container.firstElementChild as HTMLElement
    // Assert: mounted, but not yet entered (transition hasn't started)
    expect(el).not.toBeNull()
    expect(el.className).toContain('fluid-materialize')
    expect(el.className).not.toContain('fluid-materialize--entered')

    // Act: flush the rAF-scheduled microtask
    await act(async () => {
      await Promise.resolve()
    })

    // Assert
    expect(el.className).toContain('fluid-materialize--entered')
  })

  it('unmounts after the close transition completes (safety timeout)', async () => {
    // Arrange
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { container, rerender } = render(
      <Materialize show durMs={100}>
        content
      </Materialize>,
    )
    // Act
    rerender(
      <Materialize show={false} durMs={100}>
        content
      </Materialize>,
    )
    expect(container.firstChild).not.toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    // Assert
    expect(container.firstChild).toBeNull()
    vi.useRealTimers()
  })

  it('under reduced motion, only opacity transitions (no scale/blur)', () => {
    // Arrange
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    // Act
    const { container } = render(<Materialize show>content</Materialize>)
    const el = container.firstElementChild as HTMLElement
    // Assert
    expect(el.className).toContain('fluid-materialize--reduced')
  })
})
