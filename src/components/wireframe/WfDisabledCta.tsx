import { useId } from 'react'

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
 * `notePlacement="below"` renders the button as a single-line pill (to sit
 * height-matched next to a real CTA button) with the note as a separate
 * caption underneath, connected via `aria-describedby` — used by Home's
 * ACT ON IT block where a two-line dashed box next to a solid pill button
 * looked mismatched. Default `"inline"` keeps the original two-line box
 * (Lab's drawer CTAs, which have no adjacent solid button to match).
 *
 * CSS: src/styles/wireframe.css `.wf-disabled-cta`, `.wf-disabled-cta--pill`.
 */
export interface WfDisabledCtaProps {
  label: string
  /** Why this CTA is inert — rendered as a small caption under the label. */
  note: string
  /** 'inline' (default) = note inside the dashed box. 'below' = pill-shaped
   * box with the note as a separate caption underneath. */
  notePlacement?: 'inline' | 'below'
  className?: string
  testId?: string
}

export default function WfDisabledCta({
  label,
  note,
  notePlacement = 'inline',
  className,
  testId,
}: WfDisabledCtaProps) {
  const noteId = useId()
  const isBelow = notePlacement === 'below'
  const buttonClasses = ['wf-disabled-cta']
  if (isBelow) buttonClasses.push('wf-disabled-cta--pill')
  if (!isBelow && className) buttonClasses.push(className)

  const button = (
    <div
      className={buttonClasses.join(' ')}
      role="button"
      aria-disabled="true"
      tabIndex={0}
      aria-describedby={isBelow ? noteId : undefined}
      data-testid={testId}
    >
      <span className="wf-disabled-cta__label">{label}</span>
      {!isBelow && <span className="wf-disabled-cta__note">{note}</span>}
    </div>
  )

  if (!isBelow) return button

  const wrapperClasses = ['wf-disabled-cta-group']
  if (className) wrapperClasses.push(className)
  return (
    <div className={wrapperClasses.join(' ')}>
      {button}
      <span id={noteId} className="wf-disabled-cta__note wf-disabled-cta__note--below">
        {note}
      </span>
    </div>
  )
}
