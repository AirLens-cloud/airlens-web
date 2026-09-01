/// <reference types="node" />
// Guards the "one container, one gutter" contract (design-taxonomy.md's
// News/Dispatch Surface Contract §1, generalized to every page shell): every
// top-level page shell's horizontal padding must resolve to the same fluid
// token (`--pad-x`), not a fixed spacing step (`--sp-*`). Before Wave 1
// (design-foundation) three shells (`.ins-shell` / `.cat-shell` / `.lrn-shell`
// + `.rsc-shell` + `.lab-page`) used the fixed `--sp-5` (24px) while the rest
// of the app (`.home-shell` / `.wx-shell` / dispatch/article/blog / static
// pages) used the fluid `--pad-x` clamp — the gutter visibly jumped on
// navigation between the two groups.
//
// Wave 3 (PublicPageContainer tier adoption) moved horizontal padding for
// insights/catalog/research/content off their own shells entirely — those
// shells now declare `padding-block` only, and `PublicPageContainer[data-
// tier="hub"]` supplies `padding-inline: var(--pad-x)` once, upstream of all
// of them (see `.ins-shell`/`.cat-shell`/`.lrn-shell,.rsc-shell`/`.lab-page`
// and content.css's shared shell). The gutter-parity property this file
// guards therefore now holds structurally for those shells (one source of
// horizontal padding, not five copies of it) rather than needing a per-shell
// value check — see the "no longer own a horizontal gutter" block below.
// `.home-shell` / `.wx-shell` / `.static-page` were not part of that
// migration and still own their padding directly, so they keep the original
// per-shell check.
//
// Reads stylesheets straight off disk via node:fs — this project's browser
// tsconfig (tsconfig.app.json) does not list "node" in its ambient `types`,
// so the triple-slash reference above pulls in @types/node for this file
// only, without widening Node globals into the rest of the app's typecheck.
// (Vite's `?raw` import was tried first and rejected: Vitest's default CSS
// handling stubs `.css` imports to an empty module regardless of the `?raw`
// query, so it silently returned "" instead of the file's text.)
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const STYLES_DIR = path.resolve(__dirname)

function readStyle(file: string): string {
  return fs.readFileSync(path.join(STYLES_DIR, file), 'utf8')
}

/**
 * Extracts the padding declared inside the FIRST `{ ... }` block whose
 * selector list matches `selectorSource` (a regex source, no flags). Only
 * matches simple, non-nested declaration blocks — every shell rule this test
 * covers is a flat block with no nested `{}`.
 */
function paddingIn(cssText: string, selectorSource: string): string {
  const re = new RegExp(`${selectorSource}\\s*\\{([^}]*)\\}`, 'm')
  const block = cssText.match(re)
  if (!block) throw new Error(`selector not found in stylesheet: ${selectorSource}`)
  const padding = block[1].match(/padding\s*:\s*([^;]+);/)
  if (!padding) throw new Error(`no padding declaration inside block: ${selectorSource}`)
  return padding[1].trim()
}

/** The horizontal (left/right) component(s) of a CSS padding shorthand. */
function horizontalOf(padding: string): string[] {
  const parts = padding.split(/\s+/)
  if (parts.length === 1) return [parts[0]]
  if (parts.length === 2 || parts.length === 3) return [parts[1]]
  if (parts.length === 4) return [parts[1], parts[3]]
  throw new Error(`unexpected padding shorthand arity: "${padding}"`)
}

describe('shell gutter parity — every page shell uses var(--pad-x) horizontally', () => {
  it.each([
    ['home.css', String.raw`\.home-shell`],
    ['weather.css', String.raw`\.wx-shell`],
    ['static.css', String.raw`\.static-page`],
  ])('%s %s declares horizontal padding as var(--pad-x)', (file, selector) => {
    // Arrange
    const css = readStyle(file)
    // Act
    const padding = paddingIn(css, selector)
    // Assert
    for (const value of horizontalOf(padding)) {
      expect(value).toBe('var(--pad-x)')
    }
  })

  it.each([
    ['insights.css', String.raw`\.ins-shell`],
    ['catalog.css', String.raw`\.cat-shell`],
    ['research.css', String.raw`\.lrn-shell,\s*\n\.rsc-shell`],
    ['research.css', String.raw`\.lab-page`],
    [
      'content.css',
      String.raw`\.dispatch-page,\s*\n\.article-page,\s*\n\.blog-page,\s*\n\.blogpost-page`,
    ],
  ])(
    '%s %s no longer owns a horizontal gutter (PublicPageContainer[data-tier="hub"] supplies it)',
    (file, selector) => {
      // Arrange
      const css = readStyle(file)
      const re = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'm')
      const block = css.match(re)
      if (!block) throw new Error(`selector not found in stylesheet: ${selector}`)
      // Act / Assert — vertical rhythm stays, horizontal padding does not
      // reappear here (that would silently diverge from --pad-x again).
      expect(block[1]).toMatch(/padding-block\s*:/)
      expect(block[1]).not.toMatch(/padding-inline\s*:/)
      expect(block[1]).not.toMatch(/padding\s*:/)
    },
  )

  it('insights.css mobile override does not reintroduce a horizontal gutter', () => {
    // Arrange — the @media (max-width: 768px) override redeclares vertical
    // rhythm at a smaller step; the horizontal gutter must stay owned by
    // PublicPageContainer, not diverge back onto a per-shell value.
    const css = readStyle('insights.css')
    const mobileBlock = css.match(/@media \(max-width: 768px\) \{([^]*?)\n\}/)
    if (!mobileBlock) throw new Error('insights.css mobile media block not found')
    const re = new RegExp(String.raw`\.ins-shell\s*\{([^}]*)\}`, 'm')
    const block = mobileBlock[1].match(re)
    if (!block) throw new Error('.ins-shell not found in mobile media block')
    // Act / Assert
    expect(block[1]).not.toMatch(/padding-inline\s*:/)
    expect(block[1]).not.toMatch(/padding\s*:/)
  })

  it('PublicPageContainer text/hub tiers use var(--pad-x) for padding-inline', () => {
    // Arrange
    const css = readStyle('wireframe.css')
    // Act / Assert
    for (const tier of ['text', 'hub']) {
      const re = new RegExp(`\\.public-page-container\\[data-tier="${tier}"\\]\\s*\\{([^}]*)\\}`, 'm')
      const block = css.match(re)
      if (!block) throw new Error(`public-page-container[data-tier="${tier}"] not found`)
      const paddingInline = block[1].match(/padding-inline\s*:\s*([^;]+);/)
      if (!paddingInline) throw new Error(`no padding-inline in tier="${tier}" block`)
      expect(paddingInline[1].trim()).toBe('var(--pad-x)')
    }
  })
})
