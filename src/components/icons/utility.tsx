import { IconSvg, type IconProps } from './IconBase'

/** Utility glyphs (design brief §01, mockup §01 "Utility glyphs"). */

export function SearchIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx={10.5} cy={10.5} r={6.5} />
      <path d="M15.5 15.5L21 21" />
    </IconSvg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M5 5l14 14M19 5L5 19" />
    </IconSvg>
  )
}

/** "Open ↗" — external/citation link glyph. Renders in the accent color per the mockup's `.icell.acc`. */
export function OpenIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M6 18L18 6" />
      <path d="M9 6h9v9" />
    </IconSvg>
  )
}

export function ChevronIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M6 9l6 6 6-6" />
    </IconSvg>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3 7h18M3 12h13M3 17h18" />
    </IconSvg>
  )
}
