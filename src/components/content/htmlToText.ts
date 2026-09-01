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
 */
const CLOSING_TAG = /<\/[a-z][a-z0-9]*\s*>/gi
const TAG_TOKEN = /<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/gi

export function htmlToPlainText(input: string): string {
  if (!input) return input
  // Fast path — most rows carry plain text with no tags/entities at all,
  // and skipping the parser for them is both cheaper and avoids exercising
  // it on the common case.
  if (!/[<&]/.test(input)) return input

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
