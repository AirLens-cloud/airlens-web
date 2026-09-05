/**
 * GlobeLayerToggles — the stage's layer switchboard: one overlay picker (the
 * single scalar field painted on the sphere) plus the independent layer
 * switches.
 *
 * New in this repo — the monorepo's equivalent lived inside a much larger
 * `GlobeDashboard`. Two honesty rules carried over from that surface:
 *   1. Only flags with a renderer get a switch (`GLOBE_LAYER_TOGGLES`).
 *   2. Only ontology-renderable overlays get a picker row
 *      (`GRID_RENDERABLE_OVERLAYS`) — the same list `ScalarFieldOverlay`
 *      reads, so picking one can never paint nothing because the feed is
 *      undefined.
 *
 * P1 (design audit 2026-09-05, §2 Globe #3) — the flat 15-field + 4-switch
 * list had no hierarchy. Both halves now share one AIR / WEATHER / EVENTS /
 * MORE taxonomy, declared as data below rather than as separate render
 * branches: a group only lists an `OVERLAY_PICKER_CATEGORIES` key and/or a
 * `GLOBE_LAYER_TOGGLES` flag, so a future overlay or layer only needs a home
 * in `GLOBE_LAYER_GROUPS` (or it falls through to MORE with everything else
 * unclaimed — including the `ocean` category and any `secondary` layer,
 * which stays demoted regardless of domain since that flag already carries
 * its own reason: region coverage or reference-only, see
 * `globeLayerToggles.ts`). AIR opens by default; the rest are one tap away.
 */
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGlobeStore } from '../../../store/globeStore'
import {
  GRID_RENDERABLE_OVERLAYS,
  OVERLAY_DISPLAY_LABELS,
  OVERLAY_PICKER_CATEGORIES,
} from '../../../lib/config/globeOverlays'
import {
  GLOBE_LAYER_TOGGLES,
  type GlobeLayerToggleDef,
  type ToggleableLayerFlag,
} from '../../../lib/config/globeLayerToggles'
import type { OverlayCategoryKey, OverlayType } from '../../../types/globe'
import LiquidGlass from '../../fluid/LiquidGlass'

/** Setter name for a layer flag — `showFires` → `setShowFires`. */
const setterFor = (flag: string) => `set${flag[0].toUpperCase()}${flag.slice(1)}` as const

type GlobeLayerGroupKey = 'air' | 'weather' | 'events'
type GroupSelection = GlobeLayerGroupKey | 'more'

interface GlobeLayerGroupDef {
  key: GlobeLayerGroupKey
  label: string
  /** `OVERLAY_PICKER_CATEGORIES` keys whose field chips surface in this group. */
  overlayCategoryKeys: readonly OverlayCategoryKey[]
  /** `GLOBE_LAYER_TOGGLES` flags whose switches surface in this group. */
  layerFlags: readonly ToggleableLayerFlag[]
}

const GLOBE_LAYER_GROUPS: readonly GlobeLayerGroupDef[] = [
  { key: 'air', label: 'AIR', overlayCategoryKeys: ['aq'], layerFlags: ['showStations', 'showPredictions'] },
  { key: 'weather', label: 'WEATHER', overlayCategoryKeys: ['weather'], layerFlags: ['showParticles'] },
  { key: 'events', label: 'EVENTS', overlayCategoryKeys: ['pollen'], layerFlags: ['showFires'] },
]

const DEFAULT_GROUP: GroupSelection = 'air'

/**
 * Icon-sheet symbol per layer flag (`public/icons/globe-icons.svg`) — only
 * flags with an exact 1:1 symbol get one. The field-overlay chips (PM2.5,
 * O3, temp, ocean species, pollen species…) have no per-species symbol in
 * the sheet, so they stay label-only rather than borrowing a mismatched
 * glyph across 15 different quantities.
 */
const LAYER_ICON: Partial<Record<ToggleableLayerFlag, string>> = {
  showStations: 'layer-stations',
  showPredictions: 'layer-predictions',
  showParticles: 'layer-wind',
  showFires: 'layer-fires',
  showPollen: 'layer-pollen',
  showGrid: 'layer-grid',
}

export default function GlobeLayerToggles() {
  const overlayType = useGlobeStore((s) => s.overlayType)
  const setOverlayType = useGlobeStore((s) => s.setOverlayType)
  const showParticles = useGlobeStore((s) => s.showParticles)
  const [openGroup, setOpenGroup] = useState<GroupSelection>(DEFAULT_GROUP)

  const flags = useGlobeStore(
    useShallow((s) => Object.fromEntries(
      GLOBE_LAYER_TOGGLES.map((t) => [t.flag, s[t.flag]]),
    ) as Record<string, boolean>),
  )
  const setters = useGlobeStore(
    useShallow((s) => Object.fromEntries(
      GLOBE_LAYER_TOGGLES.map((t) => [t.flag, s[setterFor(t.flag) as keyof typeof s]]),
    ) as Record<string, (v: boolean) => void>),
  )

  const renderSwitch = ({ flag, label, detail }: GlobeLayerToggleDef) => {
    const on = flags[flag]
    const icon = LAYER_ICON[flag]
    return (
      <button
        key={flag}
        type="button"
        className={`gl-switch${on ? ' is-on' : ''}`}
        aria-pressed={on}
        onClick={() => setters[flag](!on)}
      >
        <span className="gl-switch-copy">
          {icon && (
            <svg className="gl-switch-icon" width="14" height="14" aria-hidden="true">
              <use href={`/icons/globe-icons.svg#${icon}`} />
            </svg>
          )}
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
        <span className="gl-switch-knob" aria-hidden="true">
          <span className="gl-switch-knob-dot" />
        </span>
      </button>
    )
  }

  const renderOverlayChip = (overlay: OverlayType) => (
    <button
      key={overlay}
      type="button"
      className={`gl-overlay${overlayType === overlay ? ' is-active' : ''}`}
      role="radio"
      aria-checked={overlayType === overlay}
      onClick={() => setOverlayType(overlay)}
    >
      {OVERLAY_DISPLAY_LABELS[overlay]?.label ?? overlay.toUpperCase()}
    </button>
  )

  const renderableCategory = (key: OverlayCategoryKey) => {
    const category = OVERLAY_PICKER_CATEGORIES.find((c) => c.key === key)
    if (!category) return []
    return category.overlays.filter((o) => GRID_RENDERABLE_OVERLAYS.includes(o))
  }

  const groupedCategoryKeys = new Set(GLOBE_LAYER_GROUPS.flatMap((g) => g.overlayCategoryKeys))
  const groupedLayerFlags = new Set(GLOBE_LAYER_GROUPS.flatMap((g) => g.layerFlags))
  const moreOverlays = OVERLAY_PICKER_CATEGORIES
    .filter((c) => !groupedCategoryKeys.has(c.key))
    .flatMap((c) => renderableCategory(c.key))
  const moreLayers = GLOBE_LAYER_TOGGLES.filter((t) => !groupedLayerFlags.has(t.flag))

  const tabs: { key: GroupSelection; label: string }[] = [
    ...GLOBE_LAYER_GROUPS.map((g) => ({ key: g.key, label: g.label })),
    { key: 'more' as const, label: `MORE (${moreOverlays.length + moreLayers.length})` },
  ]

  return (
    <LiquidGlass variant="night" radius={0} className="globe-layers" as="section">
      <div className="gl-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`gl-tab${openGroup === tab.key ? ' is-active' : ''}`}
            aria-expanded={openGroup === tab.key}
            aria-controls={`gl-panel-${tab.key} gl-panel-${tab.key}-layers`}
            onClick={() => setOpenGroup(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <span className="gl-kicker" aria-hidden="true">FIELD / OVERLAY</span>
      <div className="gl-overlays" role="radiogroup" aria-label="Scalar field overlay">
        <button
          type="button"
          className={`gl-overlay${overlayType === 'none' ? ' is-active' : ''}`}
          role="radio"
          aria-checked={overlayType === 'none'}
          onClick={() => setOverlayType('none')}
        >
          NONE
        </button>
        {GLOBE_LAYER_GROUPS.map((group) => (
          <div
            key={group.key}
            id={`gl-panel-${group.key}`}
            className="gl-group-panel"
            hidden={openGroup !== group.key}
          >
            {/* `wind` is a vector field drawn by the particle layer, not a
                grid texture, so it only makes sense as an overlay while that
                layer is mounted — otherwise picking it would key an empty
                stage. It lives with WEATHER, the group that also owns the
                particle layer's switch below. */}
            {group.key === 'weather' && showParticles && (
              <button
                type="button"
                className={`gl-overlay${overlayType === 'wind' ? ' is-active' : ''}`}
                role="radio"
                aria-checked={overlayType === 'wind'}
                onClick={() => setOverlayType('wind')}
              >
                WIND
              </button>
            )}
            {group.overlayCategoryKeys.flatMap(renderableCategory).map(renderOverlayChip)}
          </div>
        ))}
        <div id="gl-panel-more" className="gl-group-panel" hidden={openGroup !== 'more'}>
          {moreOverlays.map(renderOverlayChip)}
        </div>
      </div>

      <span className="gl-kicker" aria-hidden="true">LAYERS</span>
      <div className="gl-switches-groups">
        {GLOBE_LAYER_GROUPS.map((group) => (
          <div
            key={group.key}
            id={`gl-panel-${group.key}-layers`}
            className="gl-switches"
            hidden={openGroup !== group.key}
          >
            {GLOBE_LAYER_TOGGLES.filter((t) => group.layerFlags.includes(t.flag)).map(renderSwitch)}
          </div>
        ))}
        <div id="gl-panel-more-layers" className="gl-switches" hidden={openGroup !== 'more'}>
          {moreLayers.map(renderSwitch)}
        </div>
      </div>
    </LiquidGlass>
  )
}
