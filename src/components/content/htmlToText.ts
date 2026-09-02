/**
 * Plain-text derivation for feed fields that sometimes carry raw HTML
 * fragments — e.g. Guardian-sourced `news-data/articles.json` rows publish
 * `summary` as `<p>Critically endangered...</p><a href="https://...">`
 * rather than plain text, which rendered as literal escaped markup on the
 * Dispatch card and Article page (QA finding, 2026-09-01).
 *
 * String transform only — never `dangerouslySetInnerHTML`. `DOMParser`
 * builds an inert, unattached document: parsing it does not execute
 * `<script>` tags, does not fire event-handler attributes, and is never
 * painted, so reading `.textContent` back out is exactly as safe as any
 * other string operation, not a render.
 *
 * This module is also imported by the Cloudflare Pages Functions SSR layer
 * (`functions/_lib/data.ts`), whose `workerd` runtime has no `DOMParser`
 * global (a browser API) — jsdom (the vitest `environment`) does provide one,
 * so this gap is invisible to the test suite. `htmlToPlainText` therefore
 * checks for `DOMParser` before using it and falls back to a regex-only
 * strip + a small hand-rolled entity decode. The fallback does not handle
 * the raw-text-element edge case comment 2 documents below (workerd content
 * is JSON feed text, not attacker-controlled markup, so that gap is accepted
 * rather than re-implemented without a parser).
 */
const CLOSING_TAG = /<\/[a-z][a-z0-9]*\s*>/gi
const TAG_TOKEN = /<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/gi

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** `&#39;`, `&#xF1;`, `&#241;`, ... — decimal or hex numeric character references (case-insensitive `x`/digits). */
const ENTITY_TOKEN = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi

/**
 * Decodes one matched `&...;` token: named entities from `NAMED_ENTITIES`,
 * or any numeric character reference via `String.fromCodePoint` — e.g. the
 * hex refs some source feeds publish in `title` (`El Ni&#xF1;o`, QA finding
 * 2026-09-02), which the pre-fix table only covered for `&#39;` specifically
 * and left every other numeric reference (any hex ref, any other decimal
 * code point) passing through unresolved.
 */
function decodeEntityToken(token: string, body: string): string {
  if (body[0] === '#') {
    const isHex = body[1] === 'x' || body[1] === 'X'
    const codePoint = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return token
    try {
      return String.fromCodePoint(codePoint)
    } catch {
      return token
    }
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? token
}

function decodeBasicEntities(s: string): string {
  return s.replace(ENTITY_TOKEN, (m, body: string) => decodeEntityToken(m, body))
}

/**
 * No-DOMParser fallback (Cloudflare Workers `workerd`) — entity-decode FIRST,
 * then tag-strip (the reverse order of the two steps reads more natural, but
 * decoding second would leave a double-encoded row's now-literal `<p>` tags
 * — revealed only by the decode — never stripped, since the strip pass
 * already ran over the still-escaped `&lt;p&gt;` text and found nothing to
 * match. Decoding first makes both real HTML and double-encoded markup-as-
 * text land in the same shape before the strip pass sees either.
 */
function regexPlainText(input: string): string {
  const decoded = decodeBasicEntities(input)
  const spaced = decoded.replace(CLOSING_TAG, (m) => `${m} `)
  const noTags = spaced.replace(TAG_TOKEN, ' ')
  return noTags.replace(/\s+/g, ' ').trim()
}

export function htmlToPlainText(input: string): string {
  if (!input) return input
  // Fast path — most rows carry plain text with no tags/entities at all,
  // and skipping the parser for them is both cheaper and avoids exercising
  // it on the common case.
  if (!/[<&]/.test(input)) return input

  if (typeof DOMParser === 'undefined') return regexPlainText(input)

  // Pass 1 — a real HTML parse, which both decodes entities and (for
  // genuine HTML) strips real tags in the same step. Space is inserted
  // after every closing tag first so adjacent block runs (`</p><a>...`)
  // don't glue into one run-on word once the tags are gone. Feed rows
  // that carry the same markup double-encoded as text (`&lt;p&gt;...` —
  // the QA finding, 2026-09-01) only get their entities decoded here; the
  // now-literal tags are still plain characters, not real elements.
  const spaced = input.replace(CLOSING_TAG, (m) => `${m} `)
  let text = new DOMParser().parseFromString(spaced, 'text/html').body.textContent ?? ''

  // Pass 2 — a **regex** tag-strip, deliberately not a second `DOMParser`
  // pass. A second parse over decoded-but-unclosed tag text (e.g. prose
  // that mentions `<script>` without ever closing it) puts the parser
  // into HTML's "raw text" mode for that element (script/style/textarea/
  // title) with no closing tag to end it, silently swallowing every
  // character after it to EOF — the review finding this replaces
  // (2026-09-01). A regex has no such per-element parsing mode, so it
  // strips any remaining tag-shaped token, balanced or not, without that
  // failure — real HTML is already fully resolved by pass 1 and never
  // reaches here.
  if (/<\/?[a-z]/i.test(text)) {
    text = text.replace(TAG_TOKEN, ' ')
  }

  return text.replace(/\s+/g, ' ').trim()
}

/** Truncates to `maxChars`, trimming trailing whitespace before the ellipsis — never mid-surrogate-pair unsafe since this is plain text, not markup. */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars).trimEnd()}…`
}
