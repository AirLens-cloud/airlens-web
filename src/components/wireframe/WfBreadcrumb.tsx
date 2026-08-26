import type { WfBreadcrumbProps } from './types'

/**
 * WfBreadcrumb — location-indicator primitive (paper/ink doctrine).
 * Ported from AirLens-platform apps/web/src/components/wireframe/WfBreadcrumb.tsx
 * with react-router-dom's `Link` replaced by a plain `<a href>` — this repo has
 * no router installed yet. Semantics are unchanged (a11y-auditor confirmed
 * during this port: both are perceivable interactive links).
 *
 * CSS: src/styles/wireframe.css `.crumb` + `.wf-crumb`.
 */
export default function WfBreadcrumb({ items, className, ariaLabel }: WfBreadcrumbProps) {
  if (items.length === 0) return null

  const classes = ['crumb', 'wf-crumb']
  if (className) classes.push(className)

  return (
    <nav className={classes.join(' ')} aria-label={ariaLabel}>
      <ol className="wf-crumb__list">
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <li key={item.key} className="wf-crumb__item">
              {index === 0 ? (
                <span className="wf-crumb__lead" aria-hidden="true">
                  /
                </span>
              ) : (
                <span className="sep" aria-hidden="true">
                  ·
                </span>
              )}
              {last || !item.href ? (
                <span className="wf-crumb__label" aria-current={last ? 'page' : undefined}>
                  {item.label}
                </span>
              ) : (
                <a className="wf-crumb__link" href={item.href}>
                  {item.label}
                </a>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
