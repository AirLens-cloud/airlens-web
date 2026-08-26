/**
 * GlobeFallback — static 2D SVG shown when WebGL is unavailable.
 * Ported from AirLens-platform apps/web/src/components/globe/GlobeFallback.tsx
 * with react-i18next stripped (plain-English default prop) and `GLOBE_COLORS`
 * inlined as a local config module (globeFallbackConfig.ts) — the source's
 * `GLOBE_COLORS.FALLBACK_GRADIENT` isn't carried over as a full config module
 * in this port. All color values are config-driven (see globeFallbackConfig.ts).
 */
import {
  FALLBACK_GRADIENT,
  FALLBACK_MARKERS,
  FALLBACK_RIM_EDGE_HEX,
  FALLBACK_RIM_OUTER_HEX,
  FALLBACK_GLOBE_STROKE_HEX,
  FALLBACK_GRATICULE_LIGHT_HEX,
  FALLBACK_GRATICULE_MID_HEX,
  FALLBACK_GRATICULE_FAINT_HEX,
} from './globeFallbackConfig'

export interface GlobeFallbackProps {
  message?: string
}

export default function GlobeFallback({
  message = 'WebGL is not supported in this environment. Showing a static map instead of the 3D visualization.',
}: GlobeFallbackProps) {
  return (
    <div className="globe-fallback">
      <svg viewBox="0 0 540 540" aria-label="AirLens globe (2D fallback)">
        <defs>
          <radialGradient id="fbG" cx="35%" cy="30%">
            <stop offset="0%" stopColor={FALLBACK_GRADIENT[0]} />
            <stop offset="55%" stopColor={FALLBACK_GRADIENT[1]} />
            <stop offset="100%" stopColor={FALLBACK_GRADIENT[2]} />
          </radialGradient>
          <radialGradient id="fbRim" cx="50%" cy="50%">
            <stop offset="80%" stopColor={FALLBACK_RIM_EDGE_HEX} />
            <stop offset="100%" stopColor={FALLBACK_RIM_OUTER_HEX} />
          </radialGradient>
        </defs>
        <circle cx="270" cy="270" r="252" fill="url(#fbRim)" />
        <circle cx="270" cy="270" r="240" fill="url(#fbG)" stroke={FALLBACK_GLOBE_STROKE_HEX} strokeWidth="1" />
        <ellipse cx="270" cy="270" rx="240" ry="96" fill="none" stroke={FALLBACK_GRATICULE_LIGHT_HEX} strokeWidth=".5" />
        <ellipse cx="270" cy="270" rx="240" ry="160" fill="none" stroke={FALLBACK_GRATICULE_MID_HEX} strokeWidth=".4" />
        <ellipse cx="270" cy="270" rx="240" ry="220" fill="none" stroke={FALLBACK_GRATICULE_FAINT_HEX} strokeWidth=".3" />
        <line x1="30" y1="270" x2="510" y2="270" stroke={FALLBACK_GRATICULE_LIGHT_HEX} strokeWidth=".5" />
        <line x1="270" y1="30" x2="270" y2="510" stroke={FALLBACK_GRATICULE_MID_HEX} strokeWidth=".4" />
        {/* Static marker dots — representative cities (config-driven, see globeFallbackConfig.ts) */}
        {FALLBACK_MARKERS.map((m) => (
          <circle key={m.label} cx={m.cx} cy={m.cy} r={m.r} fill={m.hex} opacity={m.opacity} />
        ))}
      </svg>
      <p className="globe-fallback-msg">{message}</p>
    </div>
  )
}
