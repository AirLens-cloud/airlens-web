import type { ReactNode, CSSProperties } from 'react'

/**
 * Shared prop types for the wireframe primitive set.
 * Ported from AirLens-platform apps/web/src/components/wireframe/types.ts —
 * trimmed to the components actually ported (WfToggle / PublicPageContainer
 * excluded per the porting brief).
 */

// WfButton
export type WfButtonVariant = 'primary' | 'ghost' | 'ink' | 'outline' | 'light' | 'danger'
export type WfButtonFamily = 'pill' | 'square'
export interface WfButtonProps {
  variant: WfButtonVariant
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  style?: CSSProperties
  family?: WfButtonFamily
  type?: 'button' | 'submit' | 'reset'
  testId?: string
}

// WfSegmented
export interface WfSegmentedItem {
  key: string
  label: ReactNode
  /** Rendered as a sibling next to the segment button (never nested — buttons can't nest). */
  trailing?: ReactNode
}
export interface WfSegmentedProps {
  items: WfSegmentedItem[]
  activeKey: string
  onChange: (key: string) => void
  className?: string
  ariaLabel?: string
}

// WfTabs
export interface WfTabItem {
  key: string
  label: ReactNode
}
export interface WfTabsProps {
  items: WfTabItem[]
  activeKey: string
  onChange: (key: string) => void
  className?: string
  ariaLabel?: string
}

// WfBreadcrumb
export interface WfBreadcrumbItem {
  key: string
  label: ReactNode
  /** Present -> rendered as a link. Absent, or the last item, -> plain current-location text. */
  href?: string
}
export interface WfBreadcrumbProps {
  items: WfBreadcrumbItem[]
  className?: string
  ariaLabel?: string
}

// WfPagination
export interface WfPaginationLoadMoreProps {
  mode: 'load-more'
  loaded: number
  /** null = total unknown (server pagination) — status renders "N+" instead of inventing a total. */
  total: number | null
  hasMore?: boolean
  onLoadMore: () => void
  busy?: boolean
  label: string
  busyLabel?: string
  className?: string
  ariaLabel?: string
}
export interface WfPaginationPrevNextProps {
  mode: 'prev-next'
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  prevLabel: string
  nextLabel: string
  statusLabel: string
  className?: string
  ariaLabel?: string
}
export type WfPaginationProps = WfPaginationLoadMoreProps | WfPaginationPrevNextProps

// WfConfirmDialog
export interface WfConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
  busy?: boolean
  confirmDisabled?: boolean
  children?: ReactNode
  className?: string
}

// WfCoachmark
export interface WfCoachmarkProps {
  /** Value of the anchor element's `data-coachmark` attribute. */
  anchor: string
  open: boolean
  title: string
  description: string
  stepLabel?: string
  icon?: ReactNode
  actions: ReactNode
  onDismiss: () => void
  placement?: 'auto' | 'top' | 'bottom'
  className?: string
}

// WfGlassCard (Wave C consumer, type lives here alongside the rest of the primitive set)
export type WfGlassCardVariant = 'day' | 'night'
export type WfGlassCardAqi = 'good' | 'moderate' | 'unhealthy' | 'hazard'
export interface WfGlassCardProps {
  /** 'day' = ink follows the parent's `data-aqi` tint. 'night' = fixed white ink, tint-invariant. */
  variant?: WfGlassCardVariant
  /** AQI tint the glass sits on (day variant only — ignored for night). */
  aqi?: WfGlassCardAqi
  as?: 'div' | 'header' | 'section' | 'article' | 'aside'
  className?: string
  children?: ReactNode
  testId?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}
