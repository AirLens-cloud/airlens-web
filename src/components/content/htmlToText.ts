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
export function htmlToPlainText(input: string): string {
  if (!input) return input
  // Fast path — most rows carry plain text with no tags/entities at all,
  // and skipping the parser for them is both cheaper and avoids exercising
  // it on the common case.
  if (!/[<&]/.test(input)) return input

  let text = input
  // Up to 2 passes: a feed row can carry real HTML (`<p>...`) or the same
  // markup double-encoded as text (`&lt;p&gt;...` — the literal bug QA hit,
  // 2026-09-01). A single `DOMParser` pass only *decodes* entities into
  // literal characters when they aren't real tags to begin with — it takes
  // a second pass over that decoded text to actually strip the now-literal
  // tags. Real HTML resolves in the first pass and the loop exits early.
  for (let i = 0; i < 2 && /[<&]/.test(text); i++) {
    // Insert a space after every closing tag first, so adjacent block runs
    // (`</p><a>...`) don't glue into one run-on word once tags are stripped.
    const spaced = text.replace(/<\/[a-z][a-z0-9]*\s*>/gi, (m) => `${m} `)
    const next = new DOMParser().parseFromString(spaced, 'text/html').body.textContent ?? ''
    if (next === text) break
    text = next
  }
  return text.replace(/\s+/g, ' ').trim()
}

/** Truncates to `maxChars`, trimming trailing whitespace before the ellipsis — never mid-surrogate-pair unsafe since this is plain text, not markup. */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars).trimEnd()}…`
}
