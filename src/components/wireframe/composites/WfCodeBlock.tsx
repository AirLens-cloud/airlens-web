import type { ReactNode } from 'react'

export interface WfCodeBlockProps {
  /** Optional language hint label (mono uppercase). */
  language?: string
  children: ReactNode
  className?: string
  testId?: string
}

/**
 * WfCodeBlock — mono code/CLI block composite (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/composites/WfCodeBlock.tsx.
 * No external deps.
 */
export default function WfCodeBlock({
  language,
  children,
  className,
  testId,
}: WfCodeBlockProps) {
  const classes = ['wf-code-block']
  if (className) classes.push(className)
  return (
    <pre className={classes.join(' ')} data-testid={testId}>
      {language ? <span className="wf-code-lang">{language}</span> : null}
      <code className="wf-code-body">{children}</code>
    </pre>
  )
}
