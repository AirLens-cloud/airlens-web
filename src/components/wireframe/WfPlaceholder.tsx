import type { ReactNode } from 'react'

export interface WfPlaceholderProps {
  /** Optional label inside the placeholder (defaults to empty — visual X pattern only). */
  label?: ReactNode
  /** Optional fixed height (px or CSS value). Defaults to a responsive 1:1 aspect. */
  height?: number | string
  className?: string
  testId?: string
}

/**
 * WfPlaceholder — X-pattern empty state primitive (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfPlaceholder.tsx.
 * CSS: src/styles/wireframe.css `.wf-placeholder`.
 */
export default function WfPlaceholder({
  label,
  height,
  className,
  testId,
}: WfPlaceholderProps) {
  const classes = ['wf-placeholder']
  if (className) classes.push(className)
  const style = height !== undefined ? { height } : undefined
  return (
    <div className={classes.join(' ')} style={style} data-testid={testId} aria-hidden={!label}>
      {label ? <span className="wf-placeholder-label">{label}</span> : null}
    </div>
  )
}
