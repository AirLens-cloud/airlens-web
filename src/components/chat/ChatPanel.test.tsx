// AAA coverage for ChatPanel's active/offline switch (A-4 regression):
// before this PR ASSISTANT_API_BASE defaulted to '' and isActive was always
// false in every environment that didn't set VITE_ASSISTANT_API_BASE — now
// it defaults to the live worker URL, so isActive flips to true by default.
// This file protects both directions: the newly-live path renders the real
// input and mounts the Turnstile widget, and the explicit-override path
// (VITE_ASSISTANT_API_BASE='') still renders the pre-A-4 disabled state
// instead of a scripted/fake conversation (Glass-box).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import ChatPanel from './ChatPanel'

const dataSources = vi.hoisted(() => ({
  ASSISTANT_API_BASE: 'https://assistant.example',
  TURNSTILE_SITE_KEY: 'sitekey-under-test',
}))
vi.mock('../../lib/config/dataSources', () => dataSources)

const turnstile = vi.hoisted(() => ({
  mountTurnstileWidget: vi.fn(async (_container: HTMLElement, _sitekey: string) => {}),
}))
vi.mock('../../lib/turnstile', () => turnstile)

// ChatPanel's own send flow isn't this file's concern (assistant.test.ts and
// turnstile.test.ts already cover the session/token machinery it calls into)
// — stub it so mounting the panel never opens a real stream.
vi.mock('../../api/assistant', () => ({ streamAssistantReply: vi.fn(async function* () {}) }))

afterEach(cleanup)

beforeEach(() => {
  dataSources.ASSISTANT_API_BASE = 'https://assistant.example'
  turnstile.mountTurnstileWidget.mockClear()
  // jsdom doesn't implement scrollIntoView — ChatPanel's messages-list
  // autoscroll effect (`listEndRef.current?.scrollIntoView(...)`) calls it
  // on every mount/message change and would otherwise throw. No other test
  // in this repo mounts ChatPanel yet, so this is the first place that gap
  // needed a stub.
  Element.prototype.scrollIntoView = vi.fn()
})

describe('ChatPanel — active (ASSISTANT_API_BASE configured, the A-4 default)', () => {
  it('renders the live input, not the disabled "coming back soon" placeholder', () => {
    // Arrange / Act
    render(<ChatPanel onClose={() => {}} />)
    // Assert
    const input = screen.getByRole('textbox', { name: 'Chat input' }) as HTMLInputElement
    expect(input.disabled).toBe(false)
    expect(screen.queryByPlaceholderText(/coming back soon/i)).toBeNull()
  })

  it('mounts the Turnstile widget once, with the configured sitekey', () => {
    // Arrange / Act
    render(<ChatPanel onClose={() => {}} />)
    // Assert
    expect(turnstile.mountTurnstileWidget).toHaveBeenCalledTimes(1)
    const [container, sitekey] = turnstile.mountTurnstileWidget.mock.calls[0]
    expect(container).toBeInstanceOf(HTMLElement)
    expect(sitekey).toBe('sitekey-under-test')
  })
})

describe('ChatPanel — offline (VITE_ASSISTANT_API_BASE explicitly emptied)', () => {
  beforeEach(() => {
    dataSources.ASSISTANT_API_BASE = ''
  })

  it('renders the disabled placeholder input instead of a scripted conversation', () => {
    // Arrange / Act
    render(<ChatPanel onClose={() => {}} />)
    // Assert
    const input = screen.getByPlaceholderText(/coming back soon/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(screen.queryByRole('textbox', { name: 'Chat input' })).toBeNull()
  })

  it('never mounts the Turnstile widget when the assistant is offline', () => {
    // Arrange / Act
    render(<ChatPanel onClose={() => {}} />)
    // Assert
    expect(turnstile.mountTurnstileWidget).not.toHaveBeenCalled()
  })
})
