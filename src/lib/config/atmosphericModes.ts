import type { AtmosphericMode } from '../../types/globe';

/**
 * Mode-rail metadata — the single source for the five atmospheric lenses.
 * Ported from AirLens-platform `apps/web/src/lib/config/atmosphericModes.ts`;
 * the source carried a `lucide-react` icon per mode, which is not a dependency
 * here, so each entry carries a `glyph` — a `globe-icons.svg` symbol id
 * (`03-globe-sprite-kit.md` §교체순서 3) that AtmosphericModeRail resolves to
 * `<use href="/icons/globe-icons.svg#{glyph}">`. Note `transport` maps to the
 * `mode-flow` symbol (the sheet names it after the FLOW label, not the mode
 * id). react-i18next stripped — the English label/detail here is the
 * displayed text, not a fallback.
 */
export interface AtmosphericModeDefinition {
  id: AtmosphericMode;
  number: string;
  /** `globe-icons.svg` symbol id, e.g. `mode-live` (see AtmosphericModeRail). */
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
  { id: 'live', number: '01', glyph: 'mode-live', label: 'LIVE', detail: 'Stations + current grid' },
  { id: 'forecast', number: '02', glyph: 'mode-forecast', label: 'FORECAST', detail: 'Real GEFS frames' },
  { id: 'events', number: '03', glyph: 'mode-events', label: 'EVENTS', detail: 'FIRMS fire detections' },
  { id: 'transport', number: '04', glyph: 'mode-flow', label: 'FLOW', detail: 'Wind × concentration' },
  {
    id: 'policy',
    number: '05',
    glyph: 'mode-policy',
    label: 'POLICY',
    detail: 'Choropleth not ported yet',
    unavailableReason: 'The national-standard choropleth layer is not ported into this repo yet.',
  },
];
