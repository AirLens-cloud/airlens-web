import type { AtmosphericMode } from '../../types/globe';

/**
 * Mode-rail metadata — the single source for the five atmospheric lenses.
 * Ported from AirLens-platform `apps/web/src/lib/config/atmosphericModes.ts`;
 * the source carried a `lucide-react` icon per mode, which is not a dependency
 * here, so each entry carries a short mono glyph instead (AtmosphericModeRail
 * renders `glyph` where the source rendered `<Icon />`). react-i18next stripped
 * — the English label/detail here is the displayed text, not a fallback.
 */
export interface AtmosphericModeDefinition {
  id: AtmosphericMode;
  number: string;
  /** Short mono glyph shown in place of the source's lucide icon. */
  glyph: string;
  label: string;
  detail: string;
  /**
   * Set when this repo has no renderer for the layer bundle the mode applies.
   * A lens that changes nothing on screen reads as a broken feature, so the
   * rail disables it and says why rather than offering a dead switch.
   */
  unavailableReason?: string;
}

export const ATMOSPHERIC_MODES: readonly AtmosphericModeDefinition[] = [
  { id: 'live', number: '01', glyph: '◉', label: 'LIVE', detail: 'Stations + current grid' },
  { id: 'forecast', number: '02', glyph: '◑', label: 'FORECAST', detail: 'Real GEFS frames' },
  { id: 'events', number: '03', glyph: '▲', label: 'EVENTS', detail: 'FIRMS fire detections' },
  { id: 'transport', number: '04', glyph: '≈', label: 'FLOW', detail: 'Wind × concentration' },
  {
    id: 'policy',
    number: '05',
    glyph: '▣',
    label: 'POLICY',
    detail: 'Choropleth not ported yet',
    unavailableReason: 'The national-standard choropleth layer is not ported into this repo yet.',
  },
];
