// htmlToPlainText / truncateText — QA finding 2026-09-01: Guardian-sourced
// `summary` rows sometimes carry a raw HTML fragment
// (`<p>...</p><a href="...">...`), which rendered as literal escaped markup
// on the Dispatch card and Article page. These pin the fix: any tag/entity
// content collapses to plain text, and clean text is passed through
// untouched (fast path, no unnecessary DOMParser work).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { htmlToPlainText, truncateText } from './htmlToText'

describe('htmlToPlainText', () => {
  it('strips tags and decodes entities from an HTML fragment, leaving plain text only', () => {
    const input = '<p>Critically endangered species threatened.</p><a href="https://example.com">Read more</a>'
    const out = htmlToPlainText(input)
    expect(out).not.toMatch(/[<>]/)
    expect(out).not.toContain('&lt;')
    expect(out).toBe('Critically endangered species threatened. Read more')
  })

  it('decodes an already-escaped HTML fragment (literal &lt;p&gt; text) the same way', () => {
    const input = '&lt;p&gt;Critically endangered species threatened.&lt;/p&gt;&lt;a href="https://example.com"&gt;Read more&lt;/a&gt;'
    const out = htmlToPlainText(input)
    expect(out).not.toContain('<')
    expect(out).not.toContain('&lt;')
    expect(out).toBe('Critically endangered species threatened. Read more')
  })

  it('passes plain text through unchanged (fast path)', () => {
    expect(htmlToPlainText('Just a normal sentence.')).toBe('Just a normal sentence.')
  })

  it('returns falsy input unchanged', () => {
    expect(htmlToPlainText('')).toBe('')
  })

  // Review finding 2026-09-01: an unpaired escaped tag mention (no closing
  // tag) previously made a second `DOMParser` pass enter HTML's raw-text
  // mode for that element with nothing to end it. With a single mention
  // that resolved silently (jsdom implicitly closes at EOF); with a
  // *second* mention later in the same string, the second `<script>` gets
  // swallowed as the first one's raw-text content instead of being parsed
  // as its own tag, and leaks through unstripped — this pins that case,
  // confirmed red against the reverted 2-pass `DOMParser` implementation.
  it('preserves text on both sides of an unpaired, escaped tag mention with no closing tag', () => {
    const out = htmlToPlainText('before &lt;script&gt; after')
    expect(out).not.toContain('<')
    expect(out).toContain('before')
    expect(out).toContain('after')
    expect(out).toBe('before after')
  })

  it('strips every occurrence of a repeated, unpaired escaped tag mention (not just the first)', () => {
    const out = htmlToPlainText('multiple &lt;script&gt; mentions &lt;script&gt; again and more text after both.')
    expect(out).not.toContain('<')
    expect(out).toBe('multiple mentions again and more text after both.')
  })

  it('still cleanly strips a properly closed, double-escaped fragment (no regression from the unpaired-tag fix)', () => {
    const input = '&lt;p&gt;Critically endangered species threatened.&lt;/p&gt;&lt;a href="https://example.com"&gt;Read more&lt;/a&gt;'
    const out = htmlToPlainText(input)
    expect(out).not.toContain('<')
    expect(out).not.toContain('&lt;')
    expect(out).toBe('Critically endangered species threatened. Read more')
  })

  // QA finding 2026-09-02: a Dispatch card title rendered a raw numeric
  // character reference (`El Ni&#xF1;o Risks...`) verbatim — this pins the
  // decode for both hex and decimal numeric refs, not just the named set.
  it('decodes a hex numeric character reference', () => {
    expect(htmlToPlainText('El Ni&#xF1;o Risks')).toBe('El Niño Risks')
  })

  it('decodes a decimal numeric character reference', () => {
    expect(htmlToPlainText('El Ni&#241;o Risks')).toBe('El Niño Risks')
  })

  it('decodes an uppercase-hex numeric character reference the same way', () => {
    expect(htmlToPlainText('El Ni&#XF1;o Risks')).toBe('El Niño Risks')
  })
})

// Ported alongside the Wave 1 SSR port (plan airlens-airlens-web-2-curious-
// chipmunk) — this module now also runs in Cloudflare Pages Functions
// (`functions/_lib/data.ts`), whose `workerd` runtime has no `DOMParser`.
// jsdom (the vitest `environment`) always provides one, so the regex fallback
// path is otherwise invisible to this suite — a real bug shipped invisibly
// this way once already (the fallback decoded entities AFTER stripping tags,
// so a double-encoded `&lt;p&gt;` row's now-literal tags, revealed only by
// the decode, were never stripped; caught by a live `wrangler pages dev`
// probe, not by tests, since every case above only exercises the DOMParser
// path). `vi.stubGlobal('DOMParser', undefined)` forces the fallback branch.
describe('htmlToPlainText — no-DOMParser fallback (workerd)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('strips real HTML tags the same way as the DOMParser path', () => {
    vi.stubGlobal('DOMParser', undefined)
    const input = '<p>Critically endangered species threatened.</p><a href="https://example.com">Read more</a>'
    expect(htmlToPlainText(input)).toBe('Critically endangered species threatened. Read more')
  })

  it('decodes a double-encoded fragment (literal &lt;p&gt; text) and then strips the revealed tags', () => {
    vi.stubGlobal('DOMParser', undefined)
    const input = '&lt;p&gt;Critically endangered species threatened.&lt;/p&gt;&lt;a href="https://example.com"&gt;Read more&lt;/a&gt;'
    const out = htmlToPlainText(input)
    expect(out).not.toContain('<')
    expect(out).not.toContain('&lt;')
    expect(out).toBe('Critically endangered species threatened. Read more')
  })

  it('passes plain text through unchanged (fast path — never reaches the fallback)', () => {
    vi.stubGlobal('DOMParser', undefined)
    expect(htmlToPlainText('Just a normal sentence.')).toBe('Just a normal sentence.')
  })

  // QA finding 2026-09-02: the pre-fix fallback table only special-cased
  // `&#39;` — every other numeric character reference (any hex ref, any
  // other decimal code point) passed through unresolved in the SSR/workerd
  // path specifically, since jsdom's real DOMParser masked this in every
  // other test above.
  it('decodes a hex numeric character reference without DOMParser', () => {
    vi.stubGlobal('DOMParser', undefined)
    expect(htmlToPlainText('El Ni&#xF1;o Risks')).toBe('El Niño Risks')
  })

  it('decodes a decimal numeric character reference without DOMParser', () => {
    vi.stubGlobal('DOMParser', undefined)
    expect(htmlToPlainText('El Ni&#241;o Risks')).toBe('El Niño Risks')
  })
})

describe('truncateText', () => {
  it('leaves text at or under the cap untouched', () => {
    expect(truncateText('short', 10)).toBe('short')
  })

  it('truncates over-cap text and appends an ellipsis, trimming trailing whitespace first', () => {
    expect(truncateText('one two three four', 8)).toBe('one two…')
  })
})
