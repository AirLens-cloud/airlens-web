/**
 * CountryFlag — a self-hosted flag PNG (`getFlagUrl`, same-origin
 * `/flags/{iso2}.png`, CSP-safe unlike an external flagcdn URL) with an
 * ISO-code text fallback.
 *
 * The fallback is not an edge case: no PNG has shipped into `public/flags/`
 * yet, so today every country renders the badge. That is the correct
 * behaviour, not a bug — it is the same graceful degradation the globe's
 * flag texture already relies on when a country's PNG 404s
 * (`components/globe/three/layers/CountryExtrude.tsx`), applied here so an
 * unshipped asset reads as a labelled badge instead of a broken-image icon
 * or an OS-dependent emoji (Windows Chrome renders "AT" for an emoji flag
 * it has no glyph for — the audit finding this replaces).
 *
 * A prior country's load failure must never stick to the next one. Rather
 * than an effect that resets `failed` on every `countryCode` change, the
 * caller keys this component by `countryCode` at any call site where the
 * same JSX position can show more than one country over its lifetime (the
 * currently-selected flag) — a fresh mount starts with fresh state, no
 * effect required. A flag inside a listbox row is already keyed by its
 * country through the row's own `key` and never receives a different code.
 */
import { useState } from 'react'
import { getFlagUrl } from '../../lib/config/isoCountries'

export interface CountryFlagProps {
  countryCode: string
  countryName: string
  size?: number
}

export default function CountryFlag({ countryCode, countryName, size = 24 }: CountryFlagProps) {
  const [failed, setFailed] = useState(false)

  const iso2 = countryCode.length === 2 ? countryCode.toLowerCase() : ''
  const url = iso2 ? getFlagUrl(iso2) : ''

  const fallbackStyle = { width: size, height: size, fontSize: Math.round(size * 0.42) } // design-lint-ok: typography — glyph scales with the badge's dynamic `size` prop, not prose

  if (!url || failed) {
    return (
      <span
        className="ins-flag ins-flag--fallback num"
        style={fallbackStyle}
        aria-hidden="true"
        title={countryName}
      >
        {countryCode || '—'}
      </span>
    )
  }

  return (
    <img
      className="ins-flag"
      src={url}
      width={size}
      height={size}
      alt={`${countryName} flag`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
