/// <reference types="node" />
// W2 tables lane (F11/F12/F67) — CSS rules jsdom cannot lay out, pinned at the
// declaration level inside the specific selector / media block.
//
// LIMIT: declarations only, not rendered layout. The real measurements
// (scrollWidth > clientWidth, chip rects inside the container, a visible fade)
// belong to the orchestrator's browser render gate at 375px.
// Reads stylesheets via node:fs (Vitest stubs `.css` imports to empty modules).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string): string =>
  fs.readFileSync(path.join(path.resolve(__dirname), rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const WIREFRAME = read('wireframe.css')
const CATALOG = read('catalog.css')

/** Body of the first flat block whose selector list is exactly `selector`. */
function blockFor(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`selector not found: ${selector}`)
  return match[1]
}

describe('F12 — .seg--wrap', () => {
  it('wraps, stops clipping, and drops the group outline', () => {
    // Arrange / Act
    const body = blockFor(WIREFRAME, '.seg--wrap')
    // Assert
    expect(body).toMatch(/flex-wrap\s*:\s*wrap\s*;/)
    expect(body).toMatch(/overflow\s*:\s*visible\s*;/)
    expect(body).toMatch(/max-width\s*:\s*100%\s*;/)
    expect(body).toMatch(/border\s*:\s*0\s*;/)
  })

  it('gives every item its own hairline, overlapped by 1px so shared edges are not doubled', () => {
    // Arrange / Act
    const body = blockFor(WIREFRAME, '.seg.seg--wrap .seg-item')
    // Assert
    expect(body).toMatch(/border\s*:\s*1px solid var\(--ink-0\)\s*;/)
    expect(body).toMatch(/margin\s*:\s*0 -1px -1px 0\s*;/)
  })

  it('leaves the base .seg look untouched', () => {
    // Assert
    expect(blockFor(WIREFRAME, '.seg')).toMatch(/overflow\s*:\s*hidden\s*;/)
    expect(blockFor(WIREFRAME, '.seg')).not.toMatch(/flex-wrap/)
  })
})

describe('F67 — .seg--scroll', () => {
  const body = () => blockFor(WIREFRAME, '.seg--scroll')

  it('scrolls horizontally with the scrollbar hidden', () => {
    expect(body()).toMatch(/overflow-x\s*:\s*auto\s*;/)
    expect(body()).toMatch(/scrollbar-width\s*:\s*none\s*;/)
    expect(WIREFRAME).toMatch(/\.seg--scroll::-webkit-scrollbar\s*\{\s*display\s*:\s*none\s*;\s*\}/)
  })

  it('paints a scroll-shadow fade: local page-colour covers over pinned scroll tints', () => {
    // Assert — 2 local covers + 2 scroll fades on the same element
    expect(body().match(/\blocal\b/g)?.length).toBe(2)
    expect(body().match(/\bscroll\s*[,;]/g)?.length).toBe(2)
    expect(body()).toMatch(/var\(--bg-0\)/)
  })

  it('keeps tabs at natural width and the focus ring inside the clipping box', () => {
    expect(blockFor(WIREFRAME, '.seg--scroll .seg-item,\n.seg--scroll .seg-item-wrap')).toMatch(/flex\s*:\s*0 0 auto\s*;/)
    expect(blockFor(WIREFRAME, '.seg--scroll .seg-item:focus-visible')).toMatch(/outline-offset\s*:\s*-2px\s*;/)
  })
})

describe('F11 — /data-sources scroll affordance', () => {
  it('.cat-table-wrap keeps scrolling and gains the same scroll-shadow fade', () => {
    // Arrange / Act
    const body = blockFor(CATALOG, '.cat-table-wrap')
    // Assert
    expect(body).toMatch(/overflow-x\s*:\s*auto\s*;/)
    expect(body.match(/\blocal\b/g)?.length).toBe(2)
    expect(body.match(/\bscroll\s*[,;]/g)?.length).toBe(2)
  })

  it('shows the caption only at <=768px, hidden by default (desktop table fits)', () => {
    // Assert
    expect(blockFor(CATALOG, '.cat-scroll-hint')).toMatch(/display\s*:\s*none\s*;/)
    const media = CATALOG.match(/@media \(max-width: 768px\)\s*\{\s*\.cat-scroll-hint\s*\{([^}]*)\}/)
    expect(media).not.toBeNull()
    expect(media![1]).toMatch(/display\s*:\s*block\s*;/)
  })
})
