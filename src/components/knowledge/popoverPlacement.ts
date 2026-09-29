/**
 * Keeps TermLink's popover on screen. The popover is anchored at its
 * trigger's left edge and is 280px wide; once TermLinks sat mid-row in
 * TrustLine (W1b ⑤), a trigger two-thirds of the way across a phone put the
 * panel 30–77px past the right edge — definition clipped, whole page
 * scrolling sideways while it was open.
 */

/** Minimum gap between the popover and either viewport edge. Keep equal to
 *  `--sp-4`, which termLink.css uses for the popover's `max-width`. */
export const POPOVER_VIEWPORT_GAP_PX = 16

/**
 * Horizontal offset, in px, to apply to a left-anchored popover so it stays
 * inside the viewport's gap: negative pulls it left off a right-edge overflow,
 * positive pushes it right off the left edge (the left edge wins when the
 * panel cannot fit both). 0 when it already fits, or when nothing was
 * measured (no layout — e.g. jsdom).
 */
export function popoverShiftPx(
  anchorLeft: number,
  popoverWidth: number,
  viewportWidth: number,
  gap: number = POPOVER_VIEWPORT_GAP_PX,
): number {
  if (viewportWidth <= 0 || popoverWidth <= 0) return 0
  const overflowRight = anchorLeft + popoverWidth - (viewportWidth - gap)
  const shift = overflowRight > 0 ? -overflowRight : 0
  const left = anchorLeft + shift
  return left < gap ? shift + (gap - left) : shift
}
