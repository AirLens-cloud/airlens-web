/// <reference types="node" />
// Guards the TrustLine overflow fix (PR #58): `.trust-line__na` must re-enable
// wrapping inside `.trust-line__item`'s inherited `white-space: nowrap`.
//
// The regression this protects against: the item-level nowrap exists to keep a
// key glued to its value ("obs age 21h" must not split), but a withheld reason
// is a sentence, not a value. With nowrap inherited, "p10–p90 not published
// (this data source publishes no uncertainty range)" measured 469px against a
// 390px viewport and pushed the whole page sideways (documentElement
// .scrollWidth 502 vs clientWidth 390, CDP emulation at 390×844). The reason
// text cannot be truncated or hidden — it IS the Glass-box contract the
// component exists for — so wrapping is the only fix, and both halves of that
// pair (item nowrap + na normal) have to stay true together.
//
// LIMIT — read this before trusting a green here. This asserts the CSS
// DECLARATIONS, not the rendered layout: it cannot catch a regression that
// reintroduces overflow by some other route (a wider unbreakable token, a
// changed container width, a new `overflow-x` ancestor). A real
// `scrollWidth <= clientWidth` assertion needs a browser, and this repo has no
// Playwright/E2E infrastructure at all (no playwright.config.*, no browser
// devDependency, no visual workflow) — standing one up was judged out of scope
// for a one-line CSS guard. If browser tests ever land here, replace this file
// with the real viewport measurement rather than keeping both.
//
// Reads the stylesheet off disk via node:fs, matching
// `shellGutterParity.test.ts` — Vitest stubs `.css` imports to an empty module
// even with Vite's `?raw` query, so importing the text does not work.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const CSS = fs.readFileSync(path.join(path.resolve(__dirname), 'trust-line.css'), 'utf8')

/** Body of the first flat `{ ... }` block for `selectorSource` (a regex source). */
function blockFor(selectorSource: string): string {
  const match = CSS.match(new RegExp(`${selectorSource}\\s*\\{([^}]*)\\}`, 'm'))
  if (!match) throw new Error(`selector not found in trust-line.css: ${selectorSource}`)
  return match[1]
}

describe('TrustLine wrapping — withheld reasons wrap instead of forcing page overflow', () => {
  it('.trust-line__na re-enables wrapping', () => {
    // Arrange / Act
    const na = blockFor(String.raw`\.trust-line__na`)
    // Assert
    expect(na).toMatch(/white-space\s*:\s*normal\s*;/)
  })

  it('.trust-line__item keeps nowrap, so key:value pairs still do not split', () => {
    // Arrange / Act — the other half of the pair. Dropping this nowrap would
    // make the __na override meaningless and let "obs age 21h" break mid-pair.
    const item = blockFor(String.raw`\.trust-line__item`)
    // Assert
    expect(item).toMatch(/white-space\s*:\s*nowrap\s*;/)
  })
})
