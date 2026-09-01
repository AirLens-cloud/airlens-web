/**
 * SourceStatusDot — dot + text label for a feed's live status.
 *
 * Deliberately not `AqiDot`: that component reads a concentration grade.
 * This one reads trustworthiness of a feed poll, a different quantity —
 * reusing the same component for both would be the same DQSS/panel-fit name
 * collision the policy surface already had to keep apart
 * (`api/policy.ts` `policyFitToGrade` header comment). Color never carries
 * the status alone — the text label is the source of truth for a reader who
 * cannot see color.
 */
import type { FeedStatus } from '../../api/registry'

const STATUS_LABEL: Record<FeedStatus, string> = {
  ready: 'Ready',
  stale: 'Stale',
  unavailable: 'Unavailable',
}

export interface SourceStatusDotProps {
  status: FeedStatus
  className?: string
}

export default function SourceStatusDot({ status, className }: SourceStatusDotProps) {
  const classes = ['cat-status', `cat-status--${status}`]
  if (className) classes.push(className)
  return (
    <span className={classes.join(' ')} data-status={status}>
      <span className="cat-status-dot" aria-hidden="true" />
      <span className="cat-status-label">{STATUS_LABEL[status]}</span>
    </span>
  )
}
