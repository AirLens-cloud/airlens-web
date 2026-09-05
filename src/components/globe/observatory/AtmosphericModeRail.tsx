import { useLayoutEffect, useRef, useState } from 'react'

/**
 * AtmosphericModeRail — the 5-mode lens selector rail. Ported from
 * AirLens-platform apps/web/src/components/globe/observatory/AtmosphericModeRail.tsx
 * as a fully presentational component: the source read `useGlobeStore` +
 * `ATMOSPHERIC_MODES` (with lucide-react icons) directly; this port takes an
 * `items` array + `onSelect` callback instead, and swaps lucide icons for a
 * plain mono glyph string (lucide-react is not a dependency in this repo).
 * react-i18next stripped — plain-English default props/labels are the
 * caller's responsibility via `items`.
 *
 * `glyph` renders two ways (03-globe-sprite-kit.md §교체순서 3): a
 * `globe-icons.svg` symbol id (any `mode-*` string — `atmosphericModes.ts`'s
 * real data) becomes `<svg><use href="/icons/globe-icons.svg#{glyph}"/></svg>`
 * so it tints via `currentColor`; anything else (e.g. DesignGallery's literal
 * "●"/"▲" mocks) still renders as plain text, unchanged.
 *
 * Selection is shown two ways: the `.is-active` class (instant color/background
 * swap on the pressed button) plus a single shared `.atmos-mode-indicator`
 * element that slides between buttons (04-motion-system.md "모드 레일" scene —
 * soft-spring `top`/`height` in the default vertical layout, `left`/`width`
 * in `orientation="horizontal"`). It is a plain CSS `transition`, not a
 * keyframe animation, so a rapid re-select interrupts and redirects from
 * wherever it currently is rather than restarting.
 */
export interface AtmosphericModeRailItem {
  id: string
  number: string
  label: string
  detail: string
  /** A `globe-icons.svg` symbol id (e.g. `mode-live`), or a literal glyph character to render as plain text. */
  glyph: string
  active: boolean
  disabled?: boolean
  ariaLabel?: string
}

const GLOBE_ICONS_SHEET = '/icons/globe-icons.svg'
/** `atmosphericModes.ts` symbol ids all follow this shape; anything else (DesignGallery's literal glyph chars) falls back to plain text. */
const isIconSymbol = (glyph: string) => /^mode-[a-z]+$/.test(glyph)

export interface AtmosphericModeRailProps {
  items: AtmosphericModeRailItem[]
  onSelect: (id: string) => void
  ariaLabel?: string
  kicker?: string
  /** 'vertical' (default) is the instrument-rail layout this component was
   *  ported for. 'horizontal' lays the same buttons out as a HUD tab strip —
   *  CSS-only reflow via the `.atmos-mode-rail--horizontal` modifier class
   *  (globe-stage.css), no markup branch — and relies on `title` (added
   *  below) instead of the visible `<small>` reason line, which horizontal
   *  space doesn't have room for. */
  orientation?: 'vertical' | 'horizontal'
}

export default function AtmosphericModeRail({
  items,
  onSelect,
  ariaLabel = 'Atmospheric data mode',
  kicker = 'LENS / 05',
  orientation = 'vertical',
}: AtmosphericModeRailProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ pos: number; size: number } | null>(null)
  const activeId = items.find((item) => item.active)?.id

  useLayoutEffect(() => {
    const list = listRef.current
    const activeEl = list?.querySelector<HTMLButtonElement>('.atmos-mode.is-active')
    if (!activeEl) {
      setIndicator(null)
      return
    }
    setIndicator(
      orientation === 'horizontal'
        ? { pos: activeEl.offsetLeft, size: activeEl.offsetWidth }
        : { pos: activeEl.offsetTop, size: activeEl.offsetHeight },
    )
  }, [activeId, orientation, items.length])

  return (
    <nav
      className={`atmos-mode-rail${orientation === 'horizontal' ? ' atmos-mode-rail--horizontal' : ''}`}
      aria-label={ariaLabel}
    >
      <span className="atmos-mode-kicker" aria-hidden="true">{kicker}</span>
      <div className="atmos-mode-list" ref={listRef}>
        {indicator && (
          <span
            className="atmos-mode-indicator"
            aria-hidden="true"
            style={
              orientation === 'horizontal'
                ? { left: indicator.pos, width: indicator.size }
                : { top: indicator.pos, height: indicator.size }
            }
          />
        )}
        {items.map(({ id, number, glyph, label, detail, active, disabled, ariaLabel: itemAriaLabel }) => (
          <button
            key={id}
            type="button"
            className={`atmos-mode${active ? ' is-active' : ''}`}
            onClick={() => onSelect(id)}
            disabled={disabled}
            aria-pressed={active}
            aria-label={itemAriaLabel ?? detail}
            title={itemAriaLabel ?? detail}
          >
            <span className="atmos-mode-number">{number}</span>
            {isIconSymbol(glyph) ? (
              <svg className="atmos-mode-glyph-icon" viewBox="0 0 24 24" aria-hidden="true">
                <use href={`${GLOBE_ICONS_SHEET}#${glyph}`} />
              </svg>
            ) : (
              <span aria-hidden="true">{glyph}</span>
            )}
            <span className="atmos-mode-copy">
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <span className="atmos-mode-state" aria-hidden="true">
              {disabled ? '—' : active ? '●' : '○'}
            </span>
          </button>
        ))}
      </div>
    </nav>
  )
}
