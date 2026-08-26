import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { WfGlassCardProps } from './types'

/**
 * WfGlassCard — the single entry point for glass-material surfaces.
 * Ported from AirLens-platform apps/web/src/components/wireframe/WfGlassCard.tsx,
 * adapted per the porting brief (decision #3): the source's `plate` prop keyed
 * into an 11-phase sky gradient; this port instead takes an `aqi` prop that
 * selects a flat AQI-tint background (`data-aqi` attribute, styled in
 * surfaces.css). `variant="night"` still means fixed white ink, tint-invariant
 * (Globe HUD style) — unaffected by `aqi`.
 *
 * Ink is decided by the CSS, not this component: surfaces.css pairs each AQI
 * tint with whichever ink passes WCAG AA (measured, documented there) —
 * this component only sets the `data-aqi` attribute and lets the stylesheet
 * choose.
 */
export default function WfGlassCard({
  variant = 'day',
  aqi,
  as,
  className,
  children,
  testId,
  ...rest
}: WfGlassCardProps): ReactNode {
  const classes = ['glass-card']
  if (variant === 'night') classes.push('glass-card--night')
  if (className) classes.push(className)

  // JSX `<Tag>` narrows the `as` union into a props intersection that makes
  // `children` `never` (TS2745). createElement does not go through that narrowing.
  return createElement(
    as ?? 'div',
    {
      className: classes.join(' '),
      'data-aqi': variant === 'night' ? undefined : aqi,
      'data-testid': testId,
      ...rest,
    },
    children,
  )
}
