// AAA coverage for the Turnstile widget wiring (A-4):
// - mountTurnstileWidget renders once (idempotent), in interaction-only mode
// - getTurnstileToken() resolves with whatever the widget's callback reports
// - a widget error resolves to null (never rejects — ensureSession() awaits
//   this directly and must not throw on a blocked script/ad-blocker)
// - resetTurnstileToken() arms a fresh promise so the NEXT getTurnstileToken()
//   call waits for a new solve rather than replaying the spent token
// - the widget's own expired-callback self-heals the same way
// - mount -> unmount -> remount into a fresh container against the REAL
//   module (no vi.mock) actually produces a working widget rather than
//   silently no-op'ing against stale module state (code review, PR #50 —
//   ChatPanel.test.tsx mocks this module and per-test beforeEach resets it,
//   so neither would have caught a bug that only shows up when state
//   survives across a mount -> unmount -> remount sequence within one
//   continuous module lifetime)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mountTurnstileWidget,
  getTurnstileToken,
  resetTurnstileToken,
  unmountTurnstileWidget,
  __resetTurnstileModuleStateForTests,
} from './turnstile'

const SITEKEY = 'sitekey-under-test'

interface FakeRenderOptions {
  callback?: (token: string) => void
  'error-callback'?: () => void
  'expired-callback'?: () => void
}

function installFakeTurnstile(): {
  render: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  lastOptions: () => FakeRenderOptions
  optionsFor: (widgetId: string) => FakeRenderOptions
} {
  let lastOptions: FakeRenderOptions = {}
  const optionsById = new Map<string, FakeRenderOptions>()
  let nextId = 1
  const render = vi.fn((_container: HTMLElement, options: FakeRenderOptions) => {
    lastOptions = options
    const id = `widget-${nextId++}`
    optionsById.set(id, options)
    return id
  })
  const reset = vi.fn()
  const remove = vi.fn()
  window.turnstile = { render, reset, remove }
  return {
    render,
    reset,
    remove,
    lastOptions: () => lastOptions,
    optionsFor: (widgetId: string) => optionsById.get(widgetId) ?? {},
  }
}

beforeEach(() => {
  __resetTurnstileModuleStateForTests()
  delete window.turnstile
})

describe('mountTurnstileWidget', () => {
  it('renders the widget once with the sitekey and interaction-only appearance', async () => {
    // Arrange
    const fake = installFakeTurnstile()
    const container = document.createElement('div')
    // Act
    await mountTurnstileWidget(container, SITEKEY)
    // Assert
    expect(fake.render).toHaveBeenCalledTimes(1)
    expect(fake.render).toHaveBeenCalledWith(
      container,
      expect.objectContaining({ sitekey: SITEKEY, appearance: 'interaction-only' }),
    )
  })

  it('is idempotent — a second call while a widget is already mounted does not render again', async () => {
    // Arrange
    const fake = installFakeTurnstile()
    const container = document.createElement('div')
    await mountTurnstileWidget(container, SITEKEY)
    // Act
    await mountTurnstileWidget(container, SITEKEY)
    // Assert
    expect(fake.render).toHaveBeenCalledTimes(1)
  })
})

describe('getTurnstileToken', () => {
  it('returns null when no widget has been mounted', async () => {
    // Arrange / Act / Assert — no installFakeTurnstile(), no mount call
    expect(await getTurnstileToken()).toBeNull()
  })

  it('resolves with the token the widget callback reports', async () => {
    // Arrange
    const fake = installFakeTurnstile()
    await mountTurnstileWidget(document.createElement('div'), SITEKEY)
    // Act
    fake.lastOptions().callback?.('tok-solved-1')
    // Assert
    expect(await getTurnstileToken()).toBe('tok-solved-1')
  })

  it('resolves to null (never throws) when the widget reports an error', async () => {
    // Arrange
    const fake = installFakeTurnstile()
    await mountTurnstileWidget(document.createElement('div'), SITEKEY)
    // Act
    fake.lastOptions()['error-callback']?.()
    // Assert — ensureSession() awaits this directly; a throw here would
    // crash the chat send instead of degrading gracefully.
    await expect(getTurnstileToken()).resolves.toBeNull()
  })
})

describe('resetTurnstileToken', () => {
  it('calls turnstile.reset on the mounted widget', async () => {
    // Arrange
    const fake = installFakeTurnstile()
    await mountTurnstileWidget(document.createElement('div'), SITEKEY)
    fake.lastOptions().callback?.('tok-spent')
    // Act
    resetTurnstileToken()
    // Assert
    expect(fake.reset).toHaveBeenCalledWith('widget-1')
  })

  it('arms a fresh promise so the next getTurnstileToken() waits for a new solve', async () => {
    // Arrange
    const fake = installFakeTurnstile()
    await mountTurnstileWidget(document.createElement('div'), SITEKEY)
    fake.lastOptions().callback?.('tok-spent')
    expect(await getTurnstileToken()).toBe('tok-spent')
    // Act
    resetTurnstileToken()
    // The container widget itself would call the SAME callback reference
    // again once it re-solves — simulate that here.
    fake.lastOptions().callback?.('tok-fresh')
    // Assert
    expect(await getTurnstileToken()).toBe('tok-fresh')
  })

  it('is a no-op when no widget has been mounted', () => {
    // Arrange
    const fake = installFakeTurnstile()
    // Act / Assert — must not throw
    expect(() => resetTurnstileToken()).not.toThrow()
    expect(fake.reset).not.toHaveBeenCalled()
  })
})

describe('expired-callback self-heal', () => {
  it('resets the widget itself when the solved token expires unused', async () => {
    // Arrange
    const fake = installFakeTurnstile()
    await mountTurnstileWidget(document.createElement('div'), SITEKEY)
    // Act
    fake.lastOptions()['expired-callback']?.()
    // Assert
    expect(fake.reset).toHaveBeenCalledWith('widget-1')
  })
})

describe('mount -> unmount -> remount (PR #50 HIGH — reopening the chat panel)', () => {
  // No vi.mock('./turnstile') anywhere in this file — these run against the
  // real module, across a single continuous lifetime, which is exactly what
  // a mocked-module test or a per-test-reset test cannot exercise.

  it('unmountTurnstileWidget() removes the widget and clears the token, so remounting into a new container renders a fresh working widget', async () => {
    // Arrange — mount into container A (ChatPanel opens) and solve a token
    const fake = installFakeTurnstile()
    const containerA = document.createElement('div')
    await mountTurnstileWidget(containerA, SITEKEY)
    fake.optionsFor('widget-1').callback?.('tok-from-a')
    expect(await getTurnstileToken()).toBe('tok-from-a')

    // Act — ChatFAB closes: ChatPanel unmounts (its cleanup calls this),
    // destroying containerA's DOM node; it later reopens with a brand new
    // container element (containerB !== containerA — React remounts fresh).
    unmountTurnstileWidget()
    const containerB = document.createElement('div')
    await mountTurnstileWidget(containerB, SITEKEY)

    // Assert — the stale widget was torn down and a real second widget was
    // rendered into the new container (not a silent no-op against dead
    // state), and it actually solves a fresh, independent token.
    expect(fake.remove).toHaveBeenCalledWith('widget-1')
    expect(fake.render).toHaveBeenCalledTimes(2)
    expect(fake.render).toHaveBeenNthCalledWith(2, containerB, expect.objectContaining({ sitekey: SITEKEY }))
    fake.optionsFor('widget-2').callback?.('tok-from-b')
    expect(await getTurnstileToken()).toBe('tok-from-b')
  })

  it('self-heals when mountTurnstileWidget() is called again with a different container WITHOUT an explicit unmount in between', async () => {
    // Arrange — mount into container A, no unmount() call this time: this
    // simulates any consumer of the module (present or future) that skips
    // cleanup — the self-heal in mountTurnstileWidget() itself is the
    // second, independent layer of the PR #50 fix.
    const fake = installFakeTurnstile()
    const containerA = document.createElement('div')
    await mountTurnstileWidget(containerA, SITEKEY)

    // Act — mount into a different container without unmounting first
    const containerB = document.createElement('div')
    await mountTurnstileWidget(containerB, SITEKEY)

    // Assert — the stale widget bound to the now-orphaned containerA was
    // torn down, and a fresh widget was actually rendered into containerB.
    expect(fake.remove).toHaveBeenCalledWith('widget-1')
    expect(fake.render).toHaveBeenCalledTimes(2)
    expect(fake.render).toHaveBeenNthCalledWith(2, containerB, expect.objectContaining({ sitekey: SITEKEY }))
    fake.optionsFor('widget-2').callback?.('tok-from-b')
    expect(await getTurnstileToken()).toBe('tok-from-b')
  })

  it('remains idempotent for the SAME container across repeated calls (unaffected by the self-heal change)', async () => {
    // Arrange
    const fake = installFakeTurnstile()
    const container = document.createElement('div')
    await mountTurnstileWidget(container, SITEKEY)
    // Act
    await mountTurnstileWidget(container, SITEKEY)
    await mountTurnstileWidget(container, SITEKEY)
    // Assert — still exactly one render, no spurious remove/re-render churn
    expect(fake.render).toHaveBeenCalledTimes(1)
    expect(fake.remove).not.toHaveBeenCalled()
  })
})
