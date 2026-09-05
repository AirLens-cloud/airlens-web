/**
 * AirLensMark — 7-bar EQ wordmark glyph.
 * Ported verbatim from AirLens-platform apps/web/src/components/AirLensMark.tsx.
 * No external deps; uses `currentColor` and `var(--orange, #FF5C00)`.
 */
const BARS = [
  { x: 7.6, h: 5, delay: 0.32 },
  { x: 10.4, h: 8, delay: 0.2 },
  { x: 13.2, h: 12, delay: 0.1 },
  { x: 16, h: 16, delay: 0 },
  { x: 18.8, h: 12, delay: 0.1 },
  { x: 21.6, h: 8, delay: 0.2 },
  { x: 24.4, h: 5, delay: 0.32 },
]

export default function AirLensMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* alm-breathe / alm-pulse keyframes + reduced-motion override live in
          src/styles/motion.css — not an inline <style> here, which would
          leak "@keyframes alm-breathe…" into this SVG's textContent. */}
      <line x1="16" y1="5" x2="16" y2="27" stroke="currentColor" strokeWidth=".5" opacity=".25" />
      {BARS.map((b, i) => (
        <rect
          key={i}
          className="alm-bar"
          x={b.x - 0.75}
          y={16 - b.h / 2}
          width={1.5}
          height={b.h}
          rx={0.75}
          fill="currentColor"
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center',
            animation: `alm-breathe 3.2s ease-in-out ${b.delay}s infinite`,
          }}
        />
      ))}
      <circle
        className="alm-dot"
        cx={16}
        cy={16}
        r={1.6}
        fill="var(--orange, #FF5C00)"
        style={{
          transformBox: 'fill-box',
          transformOrigin: 'center',
          animation: 'alm-pulse 2.8s ease-in-out infinite',
        }}
      />
    </svg>
  )
}
