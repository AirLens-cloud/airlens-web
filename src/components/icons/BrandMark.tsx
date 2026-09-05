import { useId } from 'react'

/**
 * BrandMark — Liquid Band identity glyph (p50 glass core + p10-p90 glass
 * band + atmosphere rim arc), inlined from
 * docs/design-reports/2026-09-05-design-audit/icons-v2/liquid-band/mark.svg.
 * Static (ambient breathing/rotation motion is a separate Wave — 04-motion.md
 * — not part of this swap).
 *
 * Gradient/filter ids are namespaced per instance via `useId()` so multiple
 * mounts on one page (e.g. GlobalNav's `site` + `overlay` variants) never
 * collide in the DOM's single global SVG id space.
 */
export default function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const id = (name: string) => `bm-${uid}-${name}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id('or')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffc08a" />
          <stop offset=".4" stopColor="#ff6a12" />
          <stop offset="1" stopColor="#b83000" />
        </linearGradient>
        <linearGradient id={id('or2')} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd0a8" />
          <stop offset=".5" stopColor="#ff7a2a" />
          <stop offset="1" stopColor="#a62a00" />
        </linearGradient>
        <linearGradient id={id('hl')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".85" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".08" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('dot')} cx="34%" cy="28%" r="72%">
          <stop offset="0" stopColor="#fff4ea" />
          <stop offset=".3" stopColor="#ffa060" />
          <stop offset=".75" stopColor="#ff5c00" />
          <stop offset="1" stopColor="#9c2a00" />
        </radialGradient>
        <filter id={id('glow')} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={id('glowSm')} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id={id('shadow')} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000" floodOpacity=".45" />
        </filter>
      </defs>

      <circle cx={128} cy={128} r={96} stroke={`url(#${id('or2')})`} strokeWidth={8} opacity={0.28} />
      <circle cx={128} cy={128} r={92.5} stroke={`url(#${id('hl')})`} strokeWidth={1.2} opacity={0.35} />

      <circle
        cx={128}
        cy={128}
        r={66}
        stroke={`url(#${id('or')})`}
        strokeWidth={20}
        opacity={0.55}
        filter={`url(#${id('glow')})`}
      />
      <circle
        cx={128}
        cy={128}
        r={66}
        stroke={`url(#${id('or')})`}
        strokeWidth={20}
        filter={`url(#${id('shadow')})`}
      />
      <circle cx={128} cy={128} r={57.5} stroke={`url(#${id('hl')})`} strokeWidth={2} opacity={0.9} />

      <path
        d="M40 84 A100 100 0 0 1 128 28"
        stroke="#7fdfff"
        strokeWidth={2.2}
        strokeLinecap="round"
        opacity={0.7}
      />

      <circle cx={128} cy={128} r={33.75} fill="#ff5c00" opacity={0.35} filter={`url(#${id('glowSm')})`} />
      <circle cx={128} cy={128} r={27} fill={`url(#${id('dot')})`} filter={`url(#${id('shadow')})`} />
      <ellipse cx={120.44} cy={117.74} rx={10.26} ry={5.94} fill="#fff" opacity={0.55} />
    </svg>
  )
}
