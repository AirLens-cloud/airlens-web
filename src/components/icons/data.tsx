import { IconSvg, type IconProps } from './IconBase'

/** Data glyphs (design brief §01, mockup §01 "Data glyphs"). */

export function SatelliteIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x={9} y={9} width={6} height={6} />
      <path d="M3 6l4.5 4.5M21 6l-4.5 4.5M3 6h4M3 6v4M21 6h-4M21 6v4" />
      <path d="M9 18.5c1.8 1.2 4.2 1.2 6 0" />
    </IconSvg>
  )
}

export function StationIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3 20h18" />
      <path d="M12 20V8" />
      <rect x={9} y={4} width={6} height={4} />
      <path d="M6 12.5c1.5-1.5 2.5-1.5 4 0M14 12.5c1.5-1.5 2.5-1.5 4 0" />
    </IconSvg>
  )
}

export function WindIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3 8h11M3 13h15M3 18h8" />
      <path d="M14 8l2.5-2.5M18 13l2.5-2.5M11 18l2.5-2.5" />
    </IconSvg>
  )
}

/** The p10-p90 uncertainty band motif — Glass-box's visual signature. */
export function BandIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3 12c3-4 6-4 9 0s6 4 9 0" />
      <path
        d="M3 7.5c3-3 6-3 9 0M3 16.5c3 3 6 3 9 0M12 7.5c3 3 6 3 9 0M12 16.5c3-3 6-3 9 0"
        opacity={0.38}
      />
    </IconSvg>
  )
}

/** Concentric-circle "live" glyph — also the Field Assistant FAB mark (Δ4). */
export function LiveIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <circle cx={12} cy={12} r={2.4} />
      <circle cx={12} cy={12} r={6.5} opacity={0.55} />
      <circle cx={12} cy={12} r={10} opacity={0.28} />
    </IconSvg>
  )
}

export function LayersIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 3.5L21 8l-9 4.5L3 8z" />
      <path d="M3 12.5l9 4.5 9-4.5M3 17l9 4.5L21 17" opacity={0.5} />
    </IconSvg>
  )
}
