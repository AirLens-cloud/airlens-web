import type { ReactNode } from 'react'

/**
 * IconBase — shared props + `<svg>` wrapper for the custom icon set
 * (design brief §01 "계기 눈금", Wave 4 Δ3). Every icon in this directory
 * is 24px-grid, 1.5px stroke, square linecap/miter join, no fill — a
 * consistent "instrument tick" DNA, not borrowed from an icon library.
 */
export interface IconProps {
  /** Pixel size for both width and height. Default 24 (the icon's native grid). */
  size?: number
  className?: string
  /** Accessible name. Omit for decorative use next to visible text (the default). */
  title?: string
}

export function IconSvg({
  size = 24,
  className,
  title,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  )
}
