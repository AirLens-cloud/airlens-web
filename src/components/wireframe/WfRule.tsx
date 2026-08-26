export type WfRuleVariant = 'solid' | 'dashed'

export interface WfRuleProps {
  variant?: WfRuleVariant
  className?: string
}

/**
 * WfRule — decorative section divider primitive (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfRule.tsx.
 * Semantic `<hr aria-hidden>` — decorative only, screen readers skip it.
 */
export default function WfRule({ variant = 'solid', className }: WfRuleProps) {
  const classes = ['wf-rule', `wf-rule-${variant}`]
  if (className) classes.push(className)
  return <hr className={classes.join(' ')} aria-hidden="true" />
}
