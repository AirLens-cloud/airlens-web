export interface WfSkeletonProps {
  width?: number | string
  height?: number | string
  variant?: 'line' | 'block' | 'circle'
  className?: string
}

/**
 * WfSkeleton — loading-state pulse primitive (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfSkeleton.tsx.
 */
export default function WfSkeleton({
  width,
  height,
  variant = 'block',
  className,
}: WfSkeletonProps) {
  const classes = ['wf-skeleton', `wf-skeleton--${variant}`]
  if (className) classes.push(className)
  return (
    <div
      className={classes.join(' ')}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}
