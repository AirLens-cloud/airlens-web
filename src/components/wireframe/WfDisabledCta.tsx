/**
 * WfDisabledCta — a call-to-action rendered as not-yet-available: dashed
 * border, muted ink, `aria-disabled` (not a real `disabled` button — it
 * still needs to be reachable by screen readers to announce *why* it's
 * inert, which a hard-disabled control cannot do). First consumer is the
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
      tabIndex={-1}
      data-testid={testId}
    >
      <span className="wf-disabled-cta__label">{label}</span>
      <span className="wf-disabled-cta__note">{note}</span>
    </div>
  )
}
