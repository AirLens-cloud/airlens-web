import type { ReactNode } from 'react'

export interface WfNoteProps {
  source: string
  date?: string
  children?: ReactNode
  className?: string
}

/**
 * WfNote — source attribution + publish-date primitive (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfNote.tsx.
 * CSS: src/styles/wireframe.css `.wf-note`.
 */
export default function WfNote({ source, date, children, className }: WfNoteProps) {
  const classes = ['wf-note']
  if (className) classes.push(className)

  return (
    <span className={classes.join(' ')}>
      <span className="wf-note-source">{source}</span>
      {date ? (
        <>
          <span className="wf-note-sep"> · </span>
          <span className="wf-note-date">{date}</span>
        </>
      ) : null}
      {children ? (
        <>
          <span className="wf-note-sep"> · </span>
          {children}
        </>
      ) : null}
    </span>
  )
}
