import type { WfButtonProps, WfButtonFamily } from './types'

const FAMILY_MAP: Record<WfButtonFamily, Record<string, string>> = {
  pill: { ink: 'btn btn-ink', outline: 'btn btn-outline', light: 'btn btn-light', ghost: 'btn btn-ghost', primary: 'btn btn-ink', danger: 'btn btn-ink' },
  square: { ink: 'btn btn-ink', ghost: 'btn btn-ghost', danger: 'btn btn-danger', outline: 'btn btn-ghost', light: 'btn btn-ink', primary: 'btn btn-ink' },
}

/**
 * WfButton — unified button primitive (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfButton.tsx.
 *
 * family="pill"   -> `.btn` (999px radius, marketing CTAs)
 * family="square" -> `.btn` (0 radius, modal/form CTAs)
 *
 * CSS: src/styles/wireframe.css `.btn-*`.
 */
export default function WfButton({
  variant,
  children,
  onClick,
  disabled,
  className,
  style,
  family = 'pill',
  type = 'button',
  testId,
}: WfButtonProps) {
  const base = FAMILY_MAP[family][variant] ?? FAMILY_MAP[family].ink
  const classes = className ? `${base} ${className}` : base

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled}
      style={style}
      data-testid={testId}
    >
      {children}
    </button>
  )
}
