/**
 * AqiDot — 10px 6-tier (+ unknown) AQI semantic dot.
 *
 * Repainted per the porting brief (decision #4) onto the low-saturation K4
 * 6-tier palette (--aqi-good..--aqi-haz in tokens.css) instead of the source
 * app's 4-tier high-saturation wireframe palette (#6ec97a family). The 6 tiers
 * mirror the standard EPA AQI categories (good / moderate / unhealthy-for-
 * sensitive-groups / unhealthy / very-unhealthy / hazardous).
 *
 * `unknown` (6th tier, always available) = NaN / pre-load / data-gap fallback —
 * dashed outline, never a color guess. This is a UI primitive only; the caller
 * decides the tier from real data. Never rendered as the only signal — always
 * pair with a text label (Glass-box / no-color-alone doctrine, confirmed with
 * ui-ux-director during this port).
 *
 * CSS: src/styles/wireframe.css `.aqi-dot`.
 */

export type AqiTier = 'good' | 'moderate' | 'usg' | 'unhealthy' | 'very-unhealthy' | 'hazardous' | 'unknown'

export interface AqiDotProps {
  tier: AqiTier
  /** Diameter in px. Defaults to 10. */
  size?: number
  /** Optional accessible label (screen reader only) — omit when a visible text label sits alongside the dot. */
  ariaLabel?: string
  className?: string
  testId?: string
}

export default function AqiDot({
  tier,
  size = 10,
  ariaLabel,
  className,
  testId,
}: AqiDotProps) {
  const classes = ['aqi-dot']
  if (className) classes.push(className)
  const style = { width: size, height: size }
  return (
    <span
      className={classes.join(' ')}
      data-tier={tier}
      style={style}
      data-testid={testId}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    />
  )
}
