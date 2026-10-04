/// <reference types="node" />
// Wave 2 (mobile layout) source-level guards for the static/legal/methodology,
// blog-post and learn surfaces. jsdom has no layout, so these assert the
// DECLARATIONS inside the specific selector / @media block — they cannot prove
// the rendered geometry (the real-browser checks own that).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (name: string): string =>
  fs.readFileSync(path.join(path.resolve(__dirname), name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Content between the brace matching the `{` at `open`. */
function balanced(css: string, open: number): string {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error('unbalanced braces')
}

/** Flat declaration body of `selector { ... }` inside `css` (exact selector text). */
function rule(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{`, 'm').exec(css)
  if (!m) throw new Error(`selector not found: ${selector}`)
  return balanced(css, m.index + m[0].length - 1)
}

/** Inner CSS of the `@media (max-width: <px>px)` block(s) — concatenated. */
function maxWidthMedia(css: string, px: number): string {
  const re = new RegExp(`@media\\s*\\(max-width:\\s*${px}px\\)\\s*\\{`, 'g')
  let out = ''
  for (let m = re.exec(css); m; m = re.exec(css)) out += balanced(css, m.index + m[0].length - 1) + '\n'
  return out
}

/** css with every `@media { ... }` block removed (top-level rules only). */
function outsideMedia(css: string): string {
  let out = css
  for (let at = out.indexOf('@media'); at !== -1; at = out.indexOf('@media')) {
    const open = out.indexOf('{', at)
    out = out.slice(0, at) + out.slice(open + balanced(out, open).length + 2)
  }
  return out
}

const STATIC = read('static.css')
const MOBILE = maxWidthMedia(STATIC, 720)

describe('F21 — legal nav does not pin over the body in one column', () => {
  it('keeps the desktop rail sticky at the base level', () => {
    // Arrange / Act
    const nav = rule(STATIC, '.legal-nav')
    // Assert
    expect(nav).toMatch(/position\s*:\s*sticky/)
  })

  it('returns .legal-nav to normal flow inside the one-column media block', () => {
    // Arrange / Act
    const nav = rule(MOBILE, '.legal-nav')
    // Assert
    expect(nav).toMatch(/position\s*:\s*static/)
  })

  it('declares the static override after the base sticky rule (same specificity)', () => {
    // Arrange
    const baseAt = STATIC.indexOf('.legal-nav {')
    const overrideAt = STATIC.search(/@media\s*\(max-width:\s*720px\)\s*\{\s*\.legal-nav\s*\{\s*position:\s*static/)
    // Assert
    expect(overrideAt).toBeGreaterThan(baseAt)
  })
})

describe('F22 — model-card table cannot blow out the grid', () => {
  it('lets grid children shrink below min-content', () => {
    // Arrange / Act
    const children = rule(STATIC, '.legal-layout > *')
    // Assert
    expect(children).toMatch(/min-width\s*:\s*0\s*;/)
  })

  it('collapses to a shrinkable single column', () => {
    // Arrange / Act
    const layout = rule(MOBILE, '.legal-layout')
    // Assert
    expect(layout).toMatch(/grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/)
  })

  it('makes the table wrapper (not the page) the horizontal scroller', () => {
    // Arrange / Act
    const wrap = rule(STATIC, '.legal-model-table-wrap')
    // Assert
    expect(wrap).toMatch(/overflow-x\s*:\s*auto/)
    expect(wrap).toMatch(/min-width\s*:\s*0/)
    expect(rule(STATIC, '.legal-model-table')).not.toMatch(/overflow/)
  })
})

describe('F34 — methodology TOC', () => {
  it('sticks the <nav> grid item below the site nav on desktop', () => {
    // Arrange / Act
    const nav = rule(STATIC, '.methodology-nav')
    // Assert
    expect(nav).toMatch(/position\s*:\s*sticky/)
    expect(nav).toMatch(/top\s*:\s*calc\(var\(--nav-height\)\s*\+\s*var\(--sp-\d\)\)/)
  })

  it('no longer sticks the inner list (it had no room to travel)', () => {
    // Arrange / Act
    const toc = rule(STATIC, '.methodology-toc')
    // Assert
    expect(toc).not.toMatch(/position/)
  })

  it('hides the toggle by default and only shows it in the one-column block', () => {
    // Arrange / Act
    const base = rule(STATIC, '.methodology-toc-toggle')
    const mobile = rule(MOBILE, '.methodology-toc-toggle')
    // Assert
    expect(base).toMatch(/display\s*:\s*none/)
    expect(mobile).toMatch(/display\s*:\s*flex/)
  })

  it('hides the collapsed list only inside the one-column block', () => {
    // Arrange / Act
    const mobile = rule(MOBILE, '.methodology-toc[data-state="collapsed"]')
    // Assert
    expect(mobile).toMatch(/display\s*:\s*none/)
    expect(outsideMedia(STATIC)).not.toContain('data-state="collapsed"')
  })

  it('puts the nav back in flow in one column', () => {
    // Arrange / Act
    const nav = rule(MOBILE, '.methodology-nav')
    // Assert
    expect(nav).toMatch(/position\s*:\s*static/)
  })
})

describe('F62 — blog post dek measure', () => {
  it('caps .blogpost-dek at the body column width in rem, not in its own font-relative ch', () => {
    // Arrange
    const css = read('content.css')
    // Act
    const dek = rule(css, '.blogpost-dek')
    const body = rule(css, '.content-body')
    // Assert — 64ch of the body's Inter at 16px ≈ 36rem; a `ch` cap on the
    // dek would follow its larger Crimson Pro lede size and render ~20% wider.
    expect(dek).toMatch(/max-width\s*:\s*36rem/)
    expect(dek).not.toMatch(/max-width\s*:\s*[\d.]+ch/)
    expect(body).toMatch(/max-width\s*:\s*64ch/)
  })
})

describe('F61 — /learn guided-project grid', () => {
  it('uses auto-fit and no auto-fill anywhere in research.css', () => {
    // Arrange
    const css = read('research.css')
    // Act
    const grid = rule(css, '.lrn-grid')
    // Assert
    expect(grid).toMatch(/repeat\(auto-fit,\s*minmax\(280px,\s*1fr\)\)/)
    expect(css).not.toMatch(/auto-fill/)
  })
})
