/// <reference types="node" />
// Guards two Wave 2 (mobile layout) fixes on the Home and Today hero bands.
//
// GTAB1 — 768 belongs to the MOBILE side of the breakpoint scale everywhere
// else (tokens.css redefines --nav-height etc. under `max-width: 768px`, JS
// uses maxWidthQuery(768)). Four desktop two-column rules used
// `min-width: 768px`, so at exactly 768px the desktop row layout and the
// mobile tokens/typography fired together. They now start at 769px, the
// exclusive complement of the canonical 768.
//
// GTAB3 — with the hero two-column, the Home rail (~192px of chart + tiles)
// ended far short of the main column (400-620px). The row now stretches and
// the rail distributes its content down the column.
//
// LIMIT: this asserts the CSS declarations, not rendered layout (jsdom has no
// layout engine); the real-browser measurement is done by the orchestrator.
// Reads the stylesheets off disk via node:fs — Vitest stubs `.css` imports.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string): string => fs.readFileSync(path.join(__dirname, file), 'utf8')
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

const HOME_RAW = read('home.css')
const WEATHER_RAW = read('weather.css')
const HOME = strip(HOME_RAW)
const WEATHER = strip(WEATHER_RAW)

const DESKTOP_QUERY = '@media (min-width: 769px)' // design-lint-ok: breakpoint — the CSS rule text this test asserts, not a query
const LINT_COMMENT =
  'design-lint-ok: breakpoint — exclusive complement of canonical 768 (BP.LG, max-width side), not a new breakpoint'

/** Inner text of every `${DESKTOP_QUERY} { ... }` block (brace-matched). */
function desktopBlocks(css: string): string[] {
  const out: string[] = []
  let from = 0
  for (;;) {
    const at = css.indexOf(DESKTOP_QUERY, from)
    if (at === -1) return out
    const open = css.indexOf('{', at + DESKTOP_QUERY.length)
    let depth = 1
    let i = open + 1
    while (depth > 0 && i < css.length) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    out.push(css.slice(open + 1, i - 1))
    from = i
  }
}

/** Declarations of the flat `selector { ... }` rule inside a 769px block. */
function ruleInDesktopMedia(css: string, selectorSource: string): string {
  for (const block of desktopBlocks(css)) {
    const m = block.match(new RegExp(`${selectorSource}\\s*\\{([^}]*)\\}`))
    if (m) return m[1]
  }
  throw new Error(`no ${DESKTOP_QUERY} rule for ${selectorSource}`)
}

describe('GTAB1 — hero two-column rules start at 769px (768 stays mobile)', () => {
  it('home.css and weather.css keep no `min-width: 768px` query', () => {
    // Arrange / Act / Assert
    expect(HOME).not.toMatch(/min-width\s*:\s*768px/)
    expect(WEATHER).not.toMatch(/min-width\s*:\s*768px/)
  })

  it('home.css declares 769px queries (hero row, rail width, rail fill), each with the lint comment', () => {
    // Arrange / Act
    const lines = HOME_RAW.split('\n').filter((l) => l.includes(DESKTOP_QUERY))
    // Assert
    expect(lines).toHaveLength(3)
    for (const line of lines) expect(line).toContain(LINT_COMMENT)
  })

  it('weather.css declares exactly two 769px queries (band row + rail width), each with the lint comment', () => {
    // Arrange / Act
    const lines = WEATHER_RAW.split('\n').filter((l) => l.includes(DESKTOP_QUERY))
    // Assert
    expect(lines).toHaveLength(2)
    for (const line of lines) expect(line).toContain(LINT_COMMENT)
  })

  it('the row layouts sit inside the 769px queries', () => {
    // Arrange / Act
    const hero = ruleInDesktopMedia(HOME, String.raw`\.home-hero__inner`)
    const homeRail = ruleInDesktopMedia(HOME, String.raw`\.home-hero__rail`)
    const band = ruleInDesktopMedia(WEATHER, String.raw`\.wx-hero__band`)
    const wxRail = ruleInDesktopMedia(WEATHER, String.raw`\.wx-hero__rail`)
    // Assert
    expect(hero).toMatch(/flex-direction\s*:\s*row\s*;/)
    expect(homeRail).toMatch(/width\s*:\s*clamp\(/)
    expect(band).toMatch(/flex-direction\s*:\s*row\s*;/)
    expect(wxRail).toMatch(/width\s*:\s*clamp\(/)
  })

  it('the mobile-side 768 query for the hero value is untouched', () => {
    // Arrange / Act / Assert
    expect(HOME).toMatch(/@media \(max-width: 768px\)\s*\{\s*\.home-hero__value/)
  })
})

describe('GTAB3 — Home hero rail fills the main column height', () => {
  it('.home-hero__inner stretches its columns at desktop widths', () => {
    // Arrange / Act
    const inner = ruleInDesktopMedia(HOME, String.raw`\.home-hero__inner`)
    // Assert
    expect(inner).toMatch(/align-items\s*:\s*stretch\s*;/)
    expect(inner).not.toMatch(/align-items\s*:\s*flex-start/)
  })

  it('the sparkline grows into a bounded plot area', () => {
    // Arrange / Act
    const svg = ruleInDesktopMedia(HOME, String.raw`\.home-hero__rail-svg`)
    // Assert
    expect(svg).toMatch(/height\s*:\s*auto\s*;/)
    expect(svg).toMatch(/flex\s*:\s*1 1 auto\s*;/)
    expect(svg).toMatch(/max-height\s*:\s*\d+px\s*;/)
  })

  it('the divider absorbs free space so the stat tiles anchor to the bottom', () => {
    // Arrange / Act
    const divider = ruleInDesktopMedia(HOME, String.raw`\.home-hero__rail-divider`)
    // Assert
    expect(divider).toMatch(/margin-top\s*:\s*auto\s*;/)
  })

  it('the desktop overrides come after the base rail rules so they win the cascade', () => {
    // Arrange
    const baseSvg = HOME.indexOf('.home-hero__rail-svg {')
    const overrideMedia = HOME.indexOf(DESKTOP_QUERY, HOME.indexOf('.home-hero__rail-divider {'))
    // Act / Assert
    expect(baseSvg).toBeGreaterThan(-1)
    expect(overrideMedia).toBeGreaterThan(baseSvg)
  })

  it('the single-column (<=768) layout keeps its base 52px sparkline', () => {
    // Arrange / Act — the base (non-media) rule
    const base = HOME.match(/\.home-hero__rail-svg\s*\{([^}]*)\}/)
    // Assert
    expect(base?.[1]).toMatch(/height\s*:\s*52px\s*;/)
  })
})
