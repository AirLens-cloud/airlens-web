/**
 * Turnstile widget wiring for the Field Assistant's session exchange
 * (A-4). `workers/assistant/src/session.ts`'s `verifyTurnstile()` requires a
 * `turnstileToken` once `TURNSTILE_SECRET` is set (production) — without one
 * `POST /api/session` 401s with `turnstile_failed`, which is exactly what
 * was happening before this file existed (`src/api/assistant.ts` sent `{}`).
 *
 * Managed widget, `appearance: 'interaction-only'`: invisible by default,
 * only rendering a checkbox if Cloudflare judges the visitor suspicious —
 * this module renders it once when ChatPanel mounts, solving happens in the
 * background (default `execution: 'render'`), and `getTurnstileToken()` is
 * what `ensureSession()` awaits before calling `/api/session`.
 *
 * Turnstile tokens are single-use: `resetTurnstileToken()` must be called
 * after a token is spent so the widget starts solving a fresh one before
 * the next session exchange needs it.
 */

interface TurnstileRenderOptions {
  sitekey: string
  appearance?: 'always' | 'execute' | 'interaction-only'
  callback?: (token: string) => void
  'error-callback'?: () => void
  'expired-callback'?: () => void
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('no document'))
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SCRIPT_SRC
    el.async = true
    el.defer = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error('Turnstile script failed to load'))
    document.head.appendChild(el)
  })
  return scriptPromise
}

let widgetId: string | null = null
let tokenPromise: Promise<string> | null = null
let resolveToken: ((token: string) => void) | null = null
let rejectToken: ((err: Error) => void) | null = null

function armTokenPromise(): void {
  tokenPromise = new Promise((resolve, reject) => {
    resolveToken = resolve
    rejectToken = reject
  })
}

/**
 * Renders the widget into `container` and starts it solving. Idempotent —
 * a second call while a widget is already mounted (e.g. a StrictMode
 * double-effect) is a no-op rather than a second widget instance.
 */
export async function mountTurnstileWidget(container: HTMLElement, sitekey: string): Promise<void> {
  if (widgetId !== null) return
  await loadScript()
  if (!window.turnstile) throw new Error('Turnstile unavailable')
  armTokenPromise()
  widgetId = window.turnstile.render(container, {
    sitekey,
    appearance: 'interaction-only',
    callback: (token) => resolveToken?.(token),
    'error-callback': () => rejectToken?.(new Error('Turnstile verification failed')),
    'expired-callback': () => {
      // The solved token expired before ensureSession() consumed it — start
      // solving a fresh one rather than leaving every future call rejecting
      // against a promise that already settled.
      if (widgetId !== null) {
        armTokenPromise()
        window.turnstile?.reset(widgetId)
      }
    },
  })
}

/**
 * Resolves with the current verification token, or `null` if the widget
 * never mounted (script blocked, ad-blocker) or errored. `null` is not an
 * error state for the caller: `verifyTurnstile()` treats a missing token as
 * a real 401 in production and a no-op pass in local dev
 * (`TURNSTILE_SECRET` unset) — this module has no way to know which, and
 * doesn't need to.
 */
export async function getTurnstileToken(): Promise<string | null> {
  if (!tokenPromise) return null
  try {
    return await tokenPromise
  } catch {
    return null
  }
}

/** Call once a token has been spent on a `/api/session` call — Turnstile
 *  tokens are single-use, so the widget must start solving a new one. */
export function resetTurnstileToken(): void {
  if (widgetId === null || !window.turnstile) return
  armTokenPromise()
  window.turnstile.reset(widgetId)
}

/** Test-only: drops all module state so each test starts from a clean slate. */
export function __resetTurnstileModuleStateForTests(): void {
  widgetId = null
  tokenPromise = null
  resolveToken = null
  rejectToken = null
  scriptPromise = null
}
