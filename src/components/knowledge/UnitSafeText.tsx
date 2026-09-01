/**
 * UnitSafeText — renders a string while protecting unit symbols (µg/m³, ppm,
 * %) from ancestor `text-transform: uppercase` (`.t-micro`/`.t-tag`,
 * typography.css:95,103). Uppercasing "µg/m³" turns µ (micro sign) into Μ
 * (Greek capital mu) — a silent character substitution, not a stylistic
 * capitalization. Reuses this repo's established `.unit { text-transform:
 * none }` guard pattern (globe-stage.css:92,146) as a shared, non-scoped
 * class in static.css so any `.t-micro`/`.t-tag` example text stays correct
 * regardless of which page renders it.
 *
 * Used by TermLink's popover example and Glossary's expanded example — both
 * render `GlossaryTerm.example` strings that contain µg/m³ literals
 * (src/content/glossaryTerms.ts).
 */

const UNIT_PATTERN = /(µg\/m³|ppm|%)/g

export default function UnitSafeText({ text }: { text: string }) {
  // A capturing-group split alternates [text, match, text, match, ..., text]
  // — odd indices are always the captured unit, never re-tested against the
  // (stateful, global) regex.
  const parts = text.split(UNIT_PATTERN)
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <span key={i} className="unit">{part}</span> : part))}
    </>
  )
}
