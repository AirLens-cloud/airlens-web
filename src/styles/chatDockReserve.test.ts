/// <reference types="node" />
// Guards F28 + F75 for the Field Assistant dock (composites.css):
//   F75 — `.chat-dock` adds env(safe-area-inset-*) to its edge offsets at every
//         width, so it clears the iOS home indicator / notch.
//   F28 — on mobile (<=768) the dock is a full-width fixed bar; a
//         `.chat-dock-reserve` spacer (rendered by ChatWidget) reserves its
//         height + bottom offset + safe-area, and is hidden on desktop.
//
// LIMIT: asserts CSS declarations, not rendered layout (jsdom has no layout);
// the real "nothing under the dock at scroll end" check needs a browser.
// Reads the stylesheet off disk — Vitest stubs `.css` imports to an empty module.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const CSS = fs
  .readFileSync(path.join(path.resolve(__dirname), 'composites.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** Body of the first flat `{ ... }` block for `selectorSource` in `css`. */
function blockIn(css: string, selectorSource: string): string {
  const match = css.match(new RegExp(`(?:^|\\})\\s*${selectorSource}\\s*\\{([^}]*)\\}`, 'm'))
  if (!match) throw new Error(`selector not found: ${selectorSource}`)
  return match[1]
}

/** Inner text of the `@media (max-width: 768px) { ... }` block that holds `.chat-dock-reserve`. */
function mobileBlock(): string {
  const start = CSS.search(/@media\s*\(max-width:\s*768px\)\s*\{[^@]*?\.chat-dock-reserve/)
  if (start < 0) throw new Error('mobile @media block with .chat-dock-reserve not found')
  let depth = 0
  const open = CSS.indexOf('{', start)
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++
    else if (CSS[i] === '}' && --depth === 0) return CSS.slice(open + 1, i)
  }
  throw new Error('unbalanced mobile @media block')
}

describe('chat dock — safe-area offsets (F75)', () => {
  it('desktop .chat-dock bottom/right add the safe-area inset to var(--sp-5)', () => {
    // Arrange / Act
    const dock = blockIn(CSS, String.raw`\.chat-dock`)
    // Assert
    expect(dock).toMatch(/bottom\s*:\s*calc\(var\(--sp-5\)\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)/)
    expect(dock).toMatch(/right\s*:\s*calc\(var\(--sp-5\)\s*\+\s*env\(safe-area-inset-right,\s*0px\)\)/)
  })

  it('mobile .chat-dock bottom/left/right add the safe-area inset to var(--sp-3)', () => {
    // Arrange / Act
    const dock = blockIn(mobileBlock(), String.raw`\.chat-dock`)
    // Assert
    expect(dock).toMatch(/bottom\s*:\s*calc\(var\(--sp-3\)\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)/)
    expect(dock).toMatch(/left\s*:\s*calc\(var\(--sp-3\)\s*\+\s*env\(safe-area-inset-left,\s*0px\)\)/)
    expect(dock).toMatch(/right\s*:\s*calc\(var\(--sp-3\)\s*\+\s*env\(safe-area-inset-right,\s*0px\)\)/)
  })
})

describe('chat dock — end-of-page reserve (F28)', () => {
  it('.chat-dock-reserve is hidden outside the mobile block', () => {
    // Arrange / Act
    const outside = CSS.replace(mobileBlock(), '')
    // Assert
    expect(blockIn(outside, String.raw`\.chat-dock-reserve`)).toMatch(/display\s*:\s*none\s*;/)
  })

  it('mobile .chat-dock-reserve reserves fab height + bottom offset + safe-area', () => {
    // Arrange / Act
    const reserve = blockIn(mobileBlock(), String.raw`\.chat-dock-reserve`)
    // Assert
    expect(reserve).toMatch(/display\s*:\s*block\s*;/)
    expect(reserve).toMatch(
      /height\s*:\s*calc\(var\(--fab-size\)\s*\+\s*var\(--sp-3\)\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)/,
    )
  })
})
