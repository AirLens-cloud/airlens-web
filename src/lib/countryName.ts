/**
 * ISO 3166-1 alpha-2 code -> English display name, via the platform's own
 * `Intl.DisplayNames` (Baseline 2020 — Chrome 81+/Firefox 86+/Safari 14.1+)
 * rather than a hand-maintained name catalogue (Karpathy §2 Ladder: platform-
 * native covers it). Returns null for an invalid/unsupported code rather
 * than falling back to the raw code — callers that need "a country chip only
 * when we can name the country" (news cross-links, UI Tier-1 P2) render
 * nothing instead of a bare "SO".
 */
let displayNames: Intl.DisplayNames | null | undefined

function getDisplayNames(): Intl.DisplayNames | null {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
    } catch {
      displayNames = null
    }
  }
  return displayNames
}

export function countryName(code: string | null | undefined): string | null {
  if (!code || code.length !== 2) return null
  const names = getDisplayNames()
  if (!names) return null
  try {
    const name = names.of(code.toUpperCase())
    if (!name) return null
    // `Intl.DisplayNames.of` doesn't always throw for an unrecognized code —
    // it can echo the raw code back verbatim, or (confirmed via this repo's
    // Node runtime for the CLDR reserved code 'ZZ') return the literal
    // "Unknown Region". Neither is a real country name; treat both as null
    // rather than displaying them as if they were one.
    if (name.toUpperCase() === code.toUpperCase()) return null
    if (name.toLowerCase().includes('unknown')) return null
    return name
  } catch {
    return null
  }
}
