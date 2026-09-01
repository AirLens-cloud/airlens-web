import { EDITORIAL_TRUST_LABEL, type EditorialTrust } from '../../types/news'

export interface EditorialTrustBadgeProps {
  trust: EditorialTrust
  className?: string
}

/**
 * EditorialTrust badge — publisher-trust indicator, Dispatch/Article's
 * "Q2: how much to trust this?" answer.
 *
 * Deliberately its OWN component, never `DqssBadge` (`components/wireframe/`)
 * — sharing the component or its color scale would visually collapse
 * editorial trust and measurement quality into one axis, which is exactly
 * what `dispatch-article-signal-desk.md` §1/§6-1 forbids. The `aria-label`
 * carries an "editorial trust:" prefix so a screen reader user gets the same
 * axis separation a sighted user gets from two different-looking badges
 * (§8).
 */
export default function EditorialTrustBadge({ trust, className }: EditorialTrustBadgeProps) {
  const classes = ['content-trust', `content-trust--${trust}`]
  if (className) classes.push(className)
  return (
    <span className={classes.join(' ')} aria-label={`editorial trust: ${EDITORIAL_TRUST_LABEL[trust]}`}>
      {EDITORIAL_TRUST_LABEL[trust]}
    </span>
  )
}
