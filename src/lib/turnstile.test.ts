// AAA coverage for the Turnstile widget wiring (A-4):
// - mountTurnstileWidget renders once (idempotent), in interaction-only mode
// - getTurnstileToken() resolves with whatever the widget's callback reports
// - a widget error resolves to null (never rejects — ensureSession() awaits
//   this directly and must not throw on a blocked script/ad-blocker)
// - resetTurnstileToken() arms a fresh promise so the NEXT getTurnstileToken()
//   call waits for a new solve rather than replaying the spent token
// - the widget's own expired-callback self-heals the same way
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mountTurnstileWidget,
  getTurnstileToken,
  resetTurnstileToken,
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
  lastOptions: () => FakeRenderOptions
} {
  let lastOptions: FakeRenderOptions = {}
  const render = vi.fn((_container: HTMLElement, options: FakeRenderOptions) => {
    lastOptions = options
    return 'widget-1'
  })
  const reset = vi.fn()
  window.turnstile = { render, reset, remove: vi.fn() }
  return { render, reset, lastOptions: () => lastOptions }
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
