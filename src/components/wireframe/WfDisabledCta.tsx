/**
 * WfDisabledCta — a call-to-action rendered as not-yet-available: dashed
 * border, muted ink, `aria-disabled` with `tabIndex={0}` (not a real
 * `disabled` button — it stays reachable by keyboard AND screen readers so
 * both can discover *why* it's inert, which a hard-disabled control cannot
 * announce). It has no handlers, so focusing it does nothing beyond reading
 * the label and note. First consumer is the
 * Home briefing's "Open in Lab" CTA; written generically so a future
 * Datasets page CTA can reuse it without copying the markup.
 *
 * CSS: src/styles/wireframe.css `.wf-disabled-cta`.
 */
export interface WfDisabledCtaProps {
  label: string
  /** Why this CTA is inert — rendered as a small caption under the label. */
  note: string
  className?: string
  testId?: string
}

export default function WfDisabledCta({ label, note, className, testId }: WfDisabledCtaProps) {
  const classes = ['wf-disabled-cta']
  if (className) classes.push(className)
  return (
    <div
      className={classes.join(' ')}
      role="button"
      aria-disabled="true"
      tabIndex={0}
      data-testid={testId}
    >
      <span className="wf-disabled-cta__label">{label}</span>
      <span className="wf-disabled-cta__note">{note}</span>
    </div>
  )
}
