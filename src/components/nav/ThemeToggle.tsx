import { useThemeStore, type ThemeMode } from '../../store/themeStore'
import { IconSvg } from '../icons/IconBase'

const ORDER: ThemeMode[] = ['system', 'light', 'dark']

const LABEL: Record<ThemeMode, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
}

/**
 * Sun / crescent-moon / half-fill "system" glyph. No entry in the shared
 * icon set (`../icons/utility.tsx`, `../icons/nav.tsx`, `../icons/data.tsx`)
 * covers a theme switch, so this stays a one-off inline SVG rather than
 * growing those files for a single consumer — same 24-grid / 1.5px-stroke /
 * square-join "instrument tick" DNA as `IconSvg` (`../icons/IconBase.tsx`).
 */
function ThemeGlyph({ mode }: { mode: ThemeMode }) {
  if (mode === 'light') {
    return (
      <IconSvg size={18}>
        <circle cx={12} cy={12} r={5} />
        <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
      </IconSvg>
    )
  }
  if (mode === 'dark') {
    return (
      <IconSvg size={18}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </IconSvg>
    )
  }
  return (
    <IconSvg size={18}>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
    </IconSvg>
  )
}

/**
 * ThemeToggle — single button cycling system -> light -> dark -> system
 * (design audit P2 §7 row 4). A 3-way segmented control was the other
 * option considered, but the nav's existing controls (`chrome-nav__trigger`,
 * `chrome-nav__mobile-toggle`) are all single icon/label buttons at
 * `--control-h-md`/`--control-h-lg` — a cycling button matches that density
 * instead of adding the nav's first multi-button group.
 */
export default function ThemeToggle() {
  const mode = useThemeStore((state) => state.mode)
  const setMode = useThemeStore((state) => state.setMode)

  function cycle() {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
    setMode(next)
  }

  return (
    <button
      type="button"
      className="chrome-nav__theme-toggle"
      onClick={cycle}
      aria-label={`Theme: ${LABEL[mode]}. Click to switch.`}
      title={LABEL[mode]}
    >
      <ThemeGlyph mode={mode} />
    </button>
  )
}
