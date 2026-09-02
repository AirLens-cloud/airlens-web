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
 */
import { useShallow } from 'zustand/react/shallow'
import { useGlobeStore } from '../../../store/globeStore'
import {
  GRID_RENDERABLE_OVERLAYS,
  OVERLAY_DISPLAY_LABELS,
  OVERLAY_PICKER_CATEGORIES,
} from '../../../lib/config/globeOverlays'
import { GLOBE_LAYER_TOGGLES, type GlobeLayerToggleDef } from '../../../lib/config/globeLayerToggles'
import type { OverlayType } from '../../../types/globe'
import LiquidGlass from '../../fluid/LiquidGlass'

/** Setter name for a layer flag — `showFires` → `setShowFires`. */
const setterFor = (flag: string) => `set${flag[0].toUpperCase()}${flag.slice(1)}` as const

export default function GlobeLayerToggles() {
  const overlayType = useGlobeStore((s) => s.overlayType)
  const setOverlayType = useGlobeStore((s) => s.setOverlayType)
  const showParticles = useGlobeStore((s) => s.showParticles)

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
    return (
      <button
        key={flag}
        type="button"
        className={`gl-switch${on ? ' is-on' : ''}`}
        aria-pressed={on}
        onClick={() => setters[flag](!on)}
      >
        <span className="gl-switch-copy">
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
        <span className="gl-switch-state" aria-hidden="true">{on ? 'ON' : 'OFF'}</span>
      </button>
    )
  }

  const primaryToggles = GLOBE_LAYER_TOGGLES.filter((t) => !t.secondary)
  const secondaryToggles = GLOBE_LAYER_TOGGLES.filter((t) => t.secondary)

  const categories = OVERLAY_PICKER_CATEGORIES
    .map((c) => ({ ...c, overlays: c.overlays.filter((o) => GRID_RENDERABLE_OVERLAYS.includes(o)) }))
    .filter((c) => c.overlays.length > 0)

  return (
    <LiquidGlass variant="night" radius={0} className="globe-layers" as="section">
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
        {/* `wind` is a vector field drawn by the particle layer, not a grid
            texture, so it only makes sense as an overlay while that layer is
            mounted — otherwise picking it would key an empty stage. */}
        {showParticles && (
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
        {categories.map((category) => (
          <div key={category.key} className="gl-overlay-group">
            <span className="gl-group-name" aria-hidden="true">{category.en}</span>
            {category.overlays.map((overlay: OverlayType) => (
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
            ))}
          </div>
        ))}
      </div>

      <span className="gl-kicker" aria-hidden="true">LAYERS</span>
      <div className="gl-switches">
        {primaryToggles.map(renderSwitch)}
      </div>
      {secondaryToggles.length > 0 && (
        <details className="gl-more">
          <summary className="gl-more-summary">MORE ({secondaryToggles.length})</summary>
          <div className="gl-switches">
            {secondaryToggles.map(renderSwitch)}
          </div>
        </details>
      )}
    </LiquidGlass>
  )
}
