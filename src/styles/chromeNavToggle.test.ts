/// <reference types="node" />
// Source-level guard for the hamburger's ink. jsdom has no UA stylesheet and
// no color-scheme, so it cannot reproduce the bug (a <button> painting in the
// OS scheme's `buttontext`); the real-browser check owns the rendered colour.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const css = fs
  .readFileSync(path.join(path.resolve(__dirname), 'chrome.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** Flat declaration body of the first top-level `selector { ... }`. */
function rule(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  if (!m) throw new Error(`selector not found: ${selector}`)
  return m[1]
}

describe('chrome nav hamburger ink', () => {
  it('draws its bars in currentColor', () => {
    // Arrange / Act
    const bars = /\.chrome-nav__hamburger,\s*\.chrome-nav__hamburger::before,\s*\.chrome-nav__hamburger::after\s*\{([^}]*)\}/.exec(css)
    // Assert — the premise the next test protects
    expect(bars?.[1]).toMatch(/background\s*:\s*currentColor/)
  })

  it('inherits the nav bar ink instead of the UA button colour', () => {
    // Arrange / Act
    const toggle = rule('.chrome-nav__mobile-toggle')
    // Assert — without it the bars follow the OS color-scheme, not the site
    // theme (white on the white bar in site-light on a dark OS)
    expect(toggle).toMatch(/(^|;)\s*color\s*:\s*inherit\s*;/)
  })
})
