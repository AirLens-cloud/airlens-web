import type { CSSProperties } from 'react'

/**
 * StateChip — a badge for an honest freshness/scope state (stale, forecast,
 * approximate, withheld, experimental), always rendered next to a value —
 * never as an opacity knock on the value itself (design-audit
 * 2026-09-05 §7 #1, promoted from `home.css`'s hero-only `.home-hero__chip`).
 *
 * Variants read apart by shape, not color, so a colorblind viewer loses
 * nothing: border style (solid/dashed/dotted) plus icon presence differ per
 * variant — see `state-chip.css` for the exact mapping.
 */
export type StateChipVariant = 'stale' | 'forecast' | 'approximate' | 'withheld' | 'experimental'

const VARIANT_LABEL: Record<StateChipVariant, string> = {
  stale: 'Stale',
  forecast: 'Forecast',
  approximate: 'Approximate',
  withheld: 'Withheld',
  experimental: 'Experimental',
}

/** Icon glyphs are decorative shape cues, not the sole differentiator — the
 * label text and border style (state-chip.css) carry the meaning too. */
const VARIANT_ICON: Partial<Record<StateChipVariant, string>> = {
  stale: '◷',
  approximate: '~',
  experimental: '△',
}

export interface StateChipProps {
  variant: StateChipVariant
  /** Extra detail appended after the label, e.g. "19h" for stale or a
   * withheld reason. Omit for a bare label chip (e.g. "Forecast"). */
  detail?: string | null
  /** Stagger position for the spring-soft entrance (80ms/step, design-audit
   * §7 "Today 숫자" motion spec). Defaults to 0 (no delay). */
  index?: number
  className?: string
}

export default function StateChip({ variant, detail, index = 0, className }: StateChipProps) {
  const classes = ['state-chip', `state-chip--${variant}`]
  if (className) classes.push(className)
  const icon = VARIANT_ICON[variant]

  return (
    <span
      className={classes.join(' ')}
      data-variant={variant}
      style={{ '--chip-i': index } as CSSProperties}
    >
      {icon ? <span aria-hidden="true">{icon} </span> : null}
      {VARIANT_LABEL[variant]}
      {detail ? ` ${detail}` : ''}
    </span>
  )
}
