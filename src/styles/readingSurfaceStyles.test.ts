/// <reference types="node" />
// W1b ⑤ — CSS rules jsdom cannot see, pinned at the declaration level.
//
// 1. TermLink carries its own stylesheet. Its rules used to live in
//    static.css, which only the static pages load; ⑤ puts TermLinks inside
//    TrustLine on Home, /today and Country pages, where an unstyled popover
//    renders inline and pushes the whole strip apart. The popover also resets
//    the host strip's mono / weight-600 / `nowrap` / uppercase typography —
//    without that a 280px definition renders as one unbroken line.
// 2. The Dispatch list card's trust badge is demoted out of mono caps, so
//    the meta row stays on its category · source · date budget (News/Dispatch
//    contract #8; DESIGN.md ≤8 mono-caps per viewport section).
//
// LIMIT: declarations, not rendered layout — the popover's colour pairing is
// checked numerically in tokens.contrast.test.ts, and the rendered result by
// the W4 render gate. Reads files via node:fs, as `trustLineWrap.test.ts`
// does (Vitest stubs `.css` imports to an empty module).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const here = path.resolve(__dirname)
const read = (rel: string): string => fs.readFileSync(path.join(here, rel), 'utf8')
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

const TERMLINK_TSX = read('../components/knowledge/TermLink.tsx')
const TERMLINK_CSS = stripComments(read('../components/knowledge/termLink.css'))
const STATIC_CSS = stripComments(read('static.css'))
const CONTENT_CSS = stripComments(read('content.css'))

/** Body of the first block whose selector is exactly `selector` at the start of a line. */
function blockFor(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`selector not found: ${selector}`)
  return match[1]
}

describe('TermLink — styles travel with the component', () => {
  it('TermLink.tsx imports its own stylesheet', () => {
    // Assert
    expect(TERMLINK_TSX).toMatch(/^import '\.\/termLink\.css'$/m)
  })

  it('the rules live only in termLink.css, not also in static.css', () => {
    // Assert — two copies would drift; the static pages get it via the import.
    expect(STATIC_CSS).not.toMatch(/\.knowledge-termlink/)
    expect(blockFor(TERMLINK_CSS, '.knowledge-termlink__popover')).toMatch(/position\s*:\s*absolute\s*;/)
  })

  it('the popover resets the host strip typography, so a definition wraps as a paragraph', () => {
    // Arrange / Act
    const popover = blockFor(TERMLINK_CSS, '.knowledge-termlink__popover')
    // Assert
    expect(popover).toMatch(/white-space\s*:\s*normal\s*;/)
    expect(popover).toMatch(/text-transform\s*:\s*none\s*;/)
    expect(popover).toMatch(/letter-spacing\s*:\s*normal\s*;/)
    expect(popover).toMatch(/font-weight\s*:\s*400\s*;/)
  })
})

describe('Dispatch card — the trust badge is not a mono-caps label', () => {
  it('sets the body face, no uppercase and no tracking on a list card', () => {
    // Arrange / Act
    const rule = blockFor(CONTENT_CSS, '.dispatch-card .content-trust')
    // Assert
    expect(rule).toMatch(/font-family\s*:\s*var\(--sans\)\s*;/)
    expect(rule).toMatch(/text-transform\s*:\s*none\s*;/)
    expect(rule).toMatch(/letter-spacing\s*:\s*normal\s*;/)
  })

  it('is scoped to the list card, so the article page keeps its mono-caps badge', () => {
    // Arrange / Act
    const base = blockFor(CONTENT_CSS, '.content-trust')
    // Assert — the base badge is still the mono-caps one the override demotes.
    expect(base).toMatch(/font-family\s*:\s*var\(--mono\)\s*;/)
    expect(base).toMatch(/text-transform\s*:\s*uppercase\s*;/)
  })
})
