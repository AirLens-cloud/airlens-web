import WfButton from './WfButton'
import type { WfPaginationProps } from './types'

/**
 * WfPagination — "load more" / prev-next primitive (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfPagination.tsx.
 * All labels are supplied by the caller — the primitive itself has no i18n dependency.
 * CSS: src/styles/wireframe.css `.wf-pagination`.
 */
export default function WfPagination(props: WfPaginationProps) {
  const classes = ['wf-pagination']
  if (props.className) classes.push(props.className)

  if (props.mode === 'load-more') {
    const { loaded, total, hasMore, onLoadMore, busy, label, busyLabel, ariaLabel } = props
    if (total !== null ? loaded >= total : !hasMore) return null

    return (
      <nav className={classes.join(' ')} aria-label={ariaLabel}>
        <WfButton
          variant="outline"
          family="square"
          onClick={onLoadMore}
          disabled={busy}
          testId="wf-pagination-load-more"
        >
          {busy && busyLabel ? busyLabel : label}
        </WfButton>
        <span className="wf-pagination__status t-micro" aria-live="polite">
          {total !== null ? `${loaded} / ${total}` : `${loaded}+`}
        </span>
      </nav>
    )
  }

  const { page, pageCount, onPageChange, prevLabel, nextLabel, statusLabel, ariaLabel } = props
  if (pageCount <= 1) return null

  return (
    <nav className={classes.join(' ')} aria-label={ariaLabel}>
      <WfButton
        variant="outline"
        family="square"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        testId="wf-pagination-prev"
      >
        {prevLabel}
      </WfButton>
      <span className="wf-pagination__status t-micro" aria-live="polite">
        {statusLabel}
      </span>
      <WfButton
        variant="outline"
        family="square"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
        testId="wf-pagination-next"
      >
        {nextLabel}
      </WfButton>
    </nav>
  )
}
