/**
 * AirLens — paper/ink wireframe primitives entry.
 * Ported from AirLens-platform apps/web/src/components/wireframe/index.ts,
 * trimmed to the components carried over in this port (WfToggle and
 * PublicPageContainer excluded — porting brief scope).
 */

export { default as WfButton } from './WfButton'
export type { WfButtonProps, WfButtonVariant, WfButtonFamily } from './types'

export { default as WfSegmented } from './WfSegmented'
export type { WfSegmentedProps, WfSegmentedItem } from './types'

export { default as WfTabs } from './WfTabs'
export type { WfTabsProps, WfTabItem } from './types'

export { default as AqiDot } from './AqiDot'
export type { AqiDotProps, AqiTier } from './AqiDot'

export { default as DqssBadge } from './DqssBadge'
export type { DqssBadgeProps, DqssGrade } from './DqssBadge'

export { default as SkyStrip } from './SkyStrip'
export type { SkyStripStatus, SkyStripLayout } from './SkyStrip'

export { default as LiveBadge } from './LiveBadge'
export type { LiveBadgeProps } from './LiveBadge'

export { default as WfTag } from './WfTag'
export type { WfTagProps } from './WfTag'

export { default as WfStamp } from './WfStamp'
export type { WfStampProps, WfStampVariant } from './WfStamp'

export { default as WfNote } from './WfNote'
export type { WfNoteProps } from './WfNote'

export { default as WfRule } from './WfRule'
export type { WfRuleProps, WfRuleVariant } from './WfRule'

export { default as WfDispatchOrnament } from './WfDispatchOrnament'

export { default as WfPlaceholder } from './WfPlaceholder'
export type { WfPlaceholderProps } from './WfPlaceholder'

export { default as WfSkeleton } from './WfSkeleton'
export type { WfSkeletonProps } from './WfSkeleton'

export { default as WfDataState } from './WfDataState'
export type { WfDataStateProps } from './WfDataState'

export { default as WfDisabledCta } from './WfDisabledCta'
export type { WfDisabledCtaProps } from './WfDisabledCta'

export { default as ScopeChip } from './ScopeChip'
export type { ScopeChipVariant } from './ScopeChip'
export { default as ScopeChipGroup } from './ScopeChipGroup'
export type { ScopeChipGroupItem } from './ScopeChipGroup'

export { default as WfBreadcrumb } from './WfBreadcrumb'
export type { WfBreadcrumbProps, WfBreadcrumbItem } from './types'

export { default as WfPagination } from './WfPagination'
export type {
  WfPaginationProps,
  WfPaginationLoadMoreProps,
  WfPaginationPrevNextProps,
} from './types'

export { default as WfConfirmDialog } from './WfConfirmDialog'
export type { WfConfirmDialogProps } from './types'

export { default as WfCoachmark } from './WfCoachmark'
export type { WfCoachmarkProps } from './types'

export { default as BilingualLabel } from './BilingualLabel'

// Composites (Wave C)
export { default as WfGlassCard } from './WfGlassCard'
export type { WfGlassCardProps, WfGlassCardVariant, WfGlassCardAqi } from './types'

export { default as WfCodeBlock } from './composites/WfCodeBlock'
export type { WfCodeBlockProps } from './composites/WfCodeBlock'

export { default as WfTimelineScrubber, snapToNearest } from './composites/WfTimelineScrubber'
export type {
  WfTimelineScrubberProps,
  WfTimelineScrubberStep,
  WfTimelineScrubberTrackConfig,
  WfTimelineScrubberPlaybackConfig,
} from './composites/WfTimelineScrubber'

export { default as WfChartFrame } from './composites/WfChartFrame'
export type { WfChartFrameProps, WfChartFrameEmptyReason } from './composites/WfChartFrame'
