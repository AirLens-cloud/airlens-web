import { IconSvg, type IconProps } from './IconBase'

/** Navigation glyphs — 5 groups (design brief §01, mockup §01 "Navigation glyphs"). */

export function TodayIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M5 13a7 7 0 0 1 14 0" />
      <path d="M2.5 16.5h19" />
      <path d="M5 20v-1.5M9.5 20v-2.5M14.5 20v-1.5M19 20v-2.5" />
    </IconSvg>
  )
}

export function MapIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx={12} cy={12} r={8.5} />
      <ellipse cx={12} cy={12} rx={4} ry={8.5} />
      <path d="M3.5 12h17" />
    </IconSvg>
  )
}

export function InsightsIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 20V9M9.3 20V4M14.6 20v-9M20 20V7" />
      <path d="M2.5 20h19" />
    </IconSvg>
  )
}

export function DataTrustIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M4 6.5h16M4 11.5h16M4 16.5h10" />
      <path d="M4 4v16" />
      <path d="M17.5 15l2 2 3-3.5" />
    </IconSvg>
  )
}

export function LearnIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 5.5C9.5 3.8 6.5 3.5 3.5 4v15c3-.5 6 .2 8.5 1.8 2.5-1.6 5.5-2.3 8.5-1.8V4c-3-.5-6-.2-8.5 1.5z" />
      <path d="M12 5.5v15.3" />
    </IconSvg>
  )
}
