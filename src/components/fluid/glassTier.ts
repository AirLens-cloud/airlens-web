/**
 * glassTier.ts — picks the LiquidGlass rendering strategy for the current
 * browser: SVG-filter refraction where it's cheap and correct (Chromium),
 * a plain backdrop-filter blur where that's supported but refraction isn't,
 * or a flat tint fallback everywhere else (including prefers-reduced-
 * transparency, which always wins first).
 */
export type GlassTier = 'refract' | 'blur' | 'tint'

let cachedTier: GlassTier | null = null

function supportsBackdropBlur(prefix: '' | '-webkit-'): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports(`${prefix}backdrop-filter`, 'blur(2px)')
  )
}

function computeGlassTier(): GlassTier {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'tint'

  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-transparency: reduce)').matches
  ) {
    return 'tint'
  }

  const ua = navigator.userAgent
  const isChromium = ua.includes('Chrom') && !/Version\/[\d.]+ Safari/.test(ua)

  if (isChromium && supportsBackdropBlur('')) return 'refract'
  if (supportsBackdropBlur('') || supportsBackdropBlur('-webkit-')) return 'blur'

  return 'tint'
}

/** Detects and caches (module lifetime) which glass rendering tier to use. */
export function detectGlassTier(): GlassTier {
  if (cachedTier === null) cachedTier = computeGlassTier()
  return cachedTier
}

/** Test-only: clears the cached tier so the next detectGlassTier() recomputes. */
export function __resetGlassTierForTest(): void {
  cachedTier = null
}
