// tokens.contrast.test.ts — Wave 0 (F02/F03/F04/F13/F26/GSKY1) render-gate.
//
// Reads tokens.css (and, for the AQI-tint glass-card pairs, surfaces.css) off
// disk via node:fs — Vitest stubs `.css` imports to an empty module, matching
// `shellGutterParity.test.ts`/`trustLineWrap.test.ts`'s existing pattern in
// this repo. Parses the light `:root { ... }` block and BOTH dark override
// blocks (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"])
// {...} }` and `:root[data-theme="dark"] {...}`), resolves `var(--x)`
// references against each theme's own merged token map (dark blocks only
// override a subset — anything they don't set falls through to the light
// `:root`, exactly like the real cascade on the same `:root` element), and
// computes WCAG 2.x contrast ratio to assert every listed text pair clears
// AA (>=4.5:1).
//
// LIMIT — read before trusting a green here. This checks DECLARED token
// values, not rendered cascade: it cannot see a component-level override
// that reintroduces a bad pair (a `.t-micro`/`.trust-line a` style beating an
// inherited ink, e.g.) — that class of bug needs a real browser (see
// `.agent/plans/uiux-direction-b/probe.js`, used for the F03/F04/GSKY1/F25
// checks jsdom cannot do). This file's job is the TOKEN layer only.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const TOKENS_PATH = path.join(path.resolve(__dirname), 'tokens.css')
const SURFACES_PATH = path.join(path.resolve(__dirname), 'surfaces.css')
const TOKENS_CSS = stripComments(fs.readFileSync(TOKENS_PATH, 'utf8'))
const SURFACES_CSS = stripComments(fs.readFileSync(SURFACES_PATH, 'utf8'))

// ---------------------------------------------------------------------------
// CSS block parsing
// ---------------------------------------------------------------------------

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

type TokenMap = Record<string, string>

/** Parses every `--name: value;` custom-property declaration in a block body. */
function parseDeclarations(block: string): TokenMap {
  const map: TokenMap = {}
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) {
    map[m[1]] = m[2].trim()
  }
  return map
}

/** Body of the first brace-balanced block whose selector text starts at `marker`. */
function extractBlockAfter(css: string, marker: string): string {
  const markerIdx = css.indexOf(marker)
  if (markerIdx === -1) throw new Error(`marker not found in CSS: ${marker}`)
  const braceStart = css.indexOf('{', markerIdx)
  if (braceStart === -1) throw new Error(`no opening brace after marker: ${marker}`)
  let depth = 0
  for (let i = braceStart; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(braceStart + 1, i)
    }
  }
  throw new Error(`unbalanced braces after marker: ${marker}`)
}

// Light theme — the top-of-file `:root { ... }` block (unique: no other
// selector in this file is the bare literal text ":root {").
const lightBlock = parseDeclarations(extractBlockAfter(TOKENS_CSS, ':root {'))

// Dark theme, OS-preference path — nested inside the prefers-color-scheme
// media query, guarded by `:not([data-theme="light"])` so an explicit light
// override wins over it (irrelevant to parsing: we just need its own body).
const darkMediaBlock = parseDeclarations(
  extractBlockAfter(TOKENS_CSS, ':root:not([data-theme="light"]) {'),
)

// Dark theme, explicit toggle path.
const darkExplicitBlock = parseDeclarations(extractBlockAfter(TOKENS_CSS, ':root[data-theme="dark"] {'))

// Each dark block only *overrides* a subset of tokens — anything absent
// falls through to the light `:root`'s value on the real cascade (same
// element, lower-specificity/earlier rule). Model that here by merging on
// top of the light map, exactly like tokens.css's own header comment
// describes the theme model.
const lightMap: TokenMap = { ...lightBlock }
const darkMediaMap: TokenMap = { ...lightBlock, ...darkMediaBlock }
const darkExplicitMap: TokenMap = { ...lightBlock, ...darkExplicitBlock }

/** Resolves `var(--x)` / `var(--x, fallback)` references against `map`, one level or recursively. */
function resolveValue(rawValue: string, map: TokenMap, seen: Set<string> = new Set()): string {
  const varRe = /var\((--[a-zA-Z0-9-]+)\s*(?:,\s*([^)]+))?\)/
  let result = rawValue
  for (let i = 0; i < 10; i++) {
    const m = varRe.exec(result)
    if (!m) break
    const [full, name, fallback] = m
    let replacement: string
    if (map[name] !== undefined) {
      if (seen.has(name)) throw new Error(`circular var() reference: ${name}`)
      const next = new Set(seen)
      next.add(name)
      replacement = resolveValue(map[name], map, next)
    } else if (fallback !== undefined) {
      replacement = resolveValue(fallback.trim(), map, seen)
    } else {
      throw new Error(`unresolved var(): ${name}`)
    }
    result = result.slice(0, m.index) + replacement + result.slice(m.index + full.length)
  }
  return result.trim()
}

function resolveToken(name: string, map: TokenMap): string {
  if (map[name] === undefined) throw new Error(`token not defined: ${name}`)
  return resolveValue(map[name], map)
}

// ---------------------------------------------------------------------------
// Color parsing + WCAG 2.x relative luminance / contrast ratio
// ---------------------------------------------------------------------------

interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

function parseColor(value: string): RGBA {
  const v = value.trim()
  const hex = v.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    }
  }
  const rgba = v.match(/^rgba?\(([^)]+)\)$/)
  if (rgba) {
    const parts = rgba[1].split(/[,/]/).map((p) => parseFloat(p.trim()))
    const [r, g, b, a] = parts
    return { r, g, b, a: a === undefined ? 1 : a }
  }
  throw new Error(`unsupported color value (expected #rgb/#rrggbb/rgb()/rgba()): "${value}"`)
}

/** Alpha-composites `fg` over an assumed-opaque `bg` (source-over). */
function compositeOver(fg: RGBA, bg: RGBA): RGBA {
  if (fg.a >= 1) return fg
  const a = fg.a
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  }
}

function srgbToLinear(channel255: number): number {
  const c = channel255 / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(rgb: RGBA): number {
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b)
}

/** WCAG 2.x contrast ratio between two (opaque, or fg pre-composited) colors. */
function contrastRatio(a: RGBA, b: RGBA): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Contrast of two raw CSS color values — `fgValue` may be translucent; it is composited over `bgValue` (assumed opaque) first. */
function contrastOf(fgValue: string, bgValue: string): number {
  const bg = parseColor(bgValue)
  const fg = parseColor(fgValue)
  return contrastRatio(compositeOver(fg, bg), bg)
}

/** Resolves two tokens against `map` and returns their contrast ratio. */
function pairContrast(fgToken: string, bgToken: string, map: TokenMap): number {
  return contrastOf(resolveToken(fgToken, map), resolveToken(bgToken, map))
}

const AA = 4.5

// ---------------------------------------------------------------------------
// Sanity: the parser actually found real theme blocks (guards against the
// whole suite silently passing on empty maps if tokens.css's structure
// changes underneath this test).
// ---------------------------------------------------------------------------

describe('tokens.css theme-block parsing sanity', () => {
  it('light :root, dark media block, and dark explicit block all parsed a non-trivial number of tokens', () => {
    expect(Object.keys(lightBlock).length).toBeGreaterThan(20)
    expect(Object.keys(darkMediaBlock).length).toBeGreaterThan(5)
    expect(Object.keys(darkExplicitBlock).length).toBeGreaterThan(5)
  })

  it('the two dark blocks declare the same set of token names (kept in sync)', () => {
    expect(Object.keys(darkMediaBlock).sort()).toEqual(Object.keys(darkExplicitBlock).sort())
  })
})

// ---------------------------------------------------------------------------
// F13 — --orange-ink on light-theme surfaces (the light-theme AA-safe text
// variant; dark theme aliases --orange-ink to --orange itself and is safe
// there because --orange sits on a DARK background, not tested here).
// ---------------------------------------------------------------------------

describe('F13 — --orange-ink on light-theme bg-0/bg-1 text pairs', () => {
  it('--orange-ink on --bg-0 passes AA', () => {
    expect(pairContrast('--orange-ink', '--bg-0', lightMap)).toBeGreaterThanOrEqual(AA)
  })
  it('--orange-ink on --bg-1 passes AA', () => {
    expect(pairContrast('--orange-ink', '--bg-1', lightMap)).toBeGreaterThanOrEqual(AA)
  })
})

// ---------------------------------------------------------------------------
// F02 — DQSS badge ink/bg pairs, both themes. Before the fix, dark ink
// (flipped to the raw grade hue) paired against the *light* pastel bg
// (never overridden in either dark block) measured A 2.83 / B 1.86 /
// D 1.87 / F 2.87:1 — all below AA. C was hard-coded (#c45a14) outside the
// token system entirely (wireframe.css) and failed in both themes.
// ---------------------------------------------------------------------------

const DQSS_GRADES = ['a', 'b', 'c', 'd', 'f'] as const

describe.each(DQSS_GRADES)('F02 — DQSS %s-grade badge ink/bg pair', (grade) => {
  const inkToken = `--dqss-${grade}-badge-ink`
  const bgToken = `--dqss-${grade}-badge-bg`

  it('light theme passes AA', () => {
    expect(pairContrast(inkToken, bgToken, lightMap)).toBeGreaterThanOrEqual(AA)
  })

  it('dark theme (prefers-color-scheme) passes AA', () => {
    expect(pairContrast(inkToken, bgToken, darkMediaMap)).toBeGreaterThanOrEqual(AA)
  })

  it('dark theme (data-theme="dark") passes AA', () => {
    expect(pairContrast(inkToken, bgToken, darkExplicitMap)).toBeGreaterThanOrEqual(AA)
  })

  it('both dark blocks resolve this pair to the same colors (kept in sync)', () => {
    expect(resolveToken(inkToken, darkMediaMap)).toBe(resolveToken(inkToken, darkExplicitMap))
    expect(resolveToken(bgToken, darkMediaMap)).toBe(resolveToken(bgToken, darkExplicitMap))
  })
})

// ---------------------------------------------------------------------------
// F26 — footer link ink on the footer's own background, both themes.
// `.chrome-footer { background: var(--bg-1); }` (chrome.css); the base bar
// (About/FAQ/legal links) uses `--ink-2` (chrome.css, fixed by this wave —
// was `--ink-3`, which measured 3.35:1 in dark theme).
// ---------------------------------------------------------------------------

describe('F26 — footer link ink (--ink-2) on footer background (--bg-1)', () => {
  it('light theme passes AA', () => {
    expect(pairContrast('--ink-2', '--bg-1', lightMap)).toBeGreaterThanOrEqual(AA)
  })
  it('dark theme (prefers-color-scheme) passes AA', () => {
    expect(pairContrast('--ink-2', '--bg-1', darkMediaMap)).toBeGreaterThanOrEqual(AA)
  })
  it('dark theme (data-theme="dark") passes AA', () => {
    expect(pairContrast('--ink-2', '--bg-1', darkExplicitMap)).toBeGreaterThanOrEqual(AA)
  })
})

// ---------------------------------------------------------------------------
// F03 — the hero's AQI-tint glass-card ink pairs (surfaces.css). These are
// theme-invariant (the AQI-tint axis, not the light/dark site theme — see
// surfaces.css's own header comment with its measured baseline), so there
// is only one set of pairs, not per-theme. Parsed straight out of
// surfaces.css's `.glass-card[data-aqi="..."]` rules rather than duplicated
// as literals here, so this test can't silently drift from the source file.
// ---------------------------------------------------------------------------

interface GlassCardTintPair {
  grade: string
  tintToken: string
  inkRaw: string
}

function parseGlassCardTintPairs(css: string): GlassCardTintPair[] {
  const re =
    /\.glass-card\[data-aqi="([a-z]+)"\]\s*\{\s*background-color:\s*var\((--tint-[a-z]+)\)\s*;\s*--glass-card-ink:\s*([^;]+);/g
  const pairs: GlassCardTintPair[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    pairs.push({ grade: m[1], tintToken: m[2], inkRaw: m[3].trim() })
  }
  return pairs
}

const glassCardTintPairs = parseGlassCardTintPairs(SURFACES_CSS)

describe('F03 — glass-card AQI-tint background + paired --glass-card-ink', () => {
  it('surfaces.css actually declared the 4 expected AQI-tint rules (parser sanity)', () => {
    expect(glassCardTintPairs.map((p) => p.grade).sort()).toEqual(
      ['good', 'hazard', 'moderate', 'unhealthy'].sort(),
    )
  })

  it.each(glassCardTintPairs)('$grade tint + its paired ink passes AA', ({ tintToken, inkRaw }) => {
    const tint = resolveToken(tintToken, lightMap)
    const ink = resolveValue(inkRaw, lightMap)
    expect(contrastOf(ink, tint)).toBeGreaterThanOrEqual(AA)
  })
})
