/**
 * Theme store — the visitor's system/light/dark pick for the site chrome
 * (design audit P2 §7 row 4, `docs/design-reports/2026-09-05-design-audit/
 * 01-ux-audit.md`). Persisted to `localStorage`; applies immediately to
 * `document.documentElement.dataset.theme` so tokens.css's existing 3-state
 * cascade (bare `:root` = light, `prefers-color-scheme` guarded by
 * `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`) picks
 * it up without a reload. 'system' means "no override" — it *removes* the
 * attribute so the `prefers-color-scheme` branch takes over, rather than
 * storing a resolved light/dark guess that would go stale the moment the OS
 * setting changes.
 *
 * The FOUC-avoiding read/apply on boot lives in `index.html`'s inline
 * `<head>` script (plain JS, runs before this module — and before any
 * bundler — parses), duplicating just the read+apply half of this file's
 * logic by necessity. Keep the two in sync if `STORAGE_KEY` or the
 * fallback-to-'system' rule ever changes.
 */
import { create } from 'zustand'

export type ThemeMode = 'system' | 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

const STORAGE_KEY = 'airlens-theme'

// Kept in sync with motion.css's `.theme-transitioning` rule. That class has
// to outlive the CSS transition it enables — removing it early would hard-cut
// the fade partway through — so this is the *only* other place the 280ms
// figure may live (not promoted to a sitewide `--dur-*` token: 280ms doesn't
// match any existing named duration, and this call site is the sole reason
// for the number to exist).
const TRANSITION_MS = 280
const TRANSITION_CLASS = 'theme-transitioning'

function readStored(): ThemeMode {
  try {
    if (typeof window === 'undefined') return 'system'
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === 'light' || raw === 'dark' ? raw : 'system'
  } catch {
    return 'system'
  }
}

function writeStored(mode: ThemeMode): void {
  try {
    if (typeof window === 'undefined') return
    if (mode === 'system') window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Storage denied/unavailable — in-memory state still works this session.
  }
}

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  } catch {
    // jsdom (and some older embedders) can expose matchMedia as a stub that
    // throws on call rather than being absent — same fallback either way.
    return false
  }
}

/** Writes `mode` onto `<html>`'s `data-theme`, the one place both this store
 *  and `index.html`'s inline script apply the theme. Exported so a test (or
 *  another future caller) can assert the DOM effect directly. */
export function applyThemeAttribute(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  if (mode === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = mode
}

function applyThemeWithCrossfade(mode: ThemeMode): void {
  if (typeof document === 'undefined') {
    applyThemeAttribute(mode)
    return
  }
  if (prefersReducedMotion()) {
    applyThemeAttribute(mode)
    return
  }
  const root = document.documentElement
  root.classList.add(TRANSITION_CLASS)
  applyThemeAttribute(mode)
  window.setTimeout(() => root.classList.remove(TRANSITION_CLASS), TRANSITION_MS)
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: readStored(),
  setMode: (mode) => {
    writeStored(mode)
    applyThemeWithCrossfade(mode)
    set({ mode })
  },
}))
