export type WfStampVariant = 'default' | 'primary' | 'unverified'

export interface WfStampProps {
  label: string
  variant?: WfStampVariant
  className?: string
  /** Render tag — 'span' for inline consumers inside a paragraph. */
  as?: 'p' | 'span'
}

/**
 * WfStamp — tier label stamp primitive (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfStamp.tsx.
 *
 * variant="primary" applies orange accent. variant="unverified" marks demo/
 * placeholder data (dashed hairline + ink-2) — Glass-box: values that are not
 * live measurements must say so at the value, not only in a footnote.
 *
 * CSS: src/styles/wireframe.css `.name` + `.wf-stamp--unverified`.
 */
export default function WfStamp({ label, variant = 'default', className, as: Tag = 'p' }: WfStampProps) {
  const classes = ['name']
  if (variant === 'unverified') classes.push('wf-stamp--unverified', 't-micro')
  if (className) classes.push(className)
  const style = variant === 'primary' ? { color: 'var(--orange)' } : undefined

  return (
    <Tag className={classes.join(' ')} style={style}>
      {label}
    </Tag>
  )
}
