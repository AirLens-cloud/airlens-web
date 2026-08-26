import type { ReactNode } from 'react'

export interface WfTagProps {
  children: ReactNode
  className?: string
  testId?: string
}

/**
 * WfTag — uppercase mono badge primitive (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfTag.tsx.
 * CSS: src/styles/wireframe.css `.wf-tag`.
 */
export default function WfTag({ children, className, testId }: WfTagProps) {
  const classes = ['wf-tag']
  if (className) classes.push(className)
  return (
    <span className={classes.join(' ')} data-testid={testId}>
      {children}
    </span>
  )
}
