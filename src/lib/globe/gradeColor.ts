/**
 * gradeColor — `PM25Grade` (the 15/35/75 grid-cell cut in `api/gridSnapshot.ts`)
 * to the existing AQI grade hex scale (`lib/config/aqi.ts`). No new palette:
 * this only picks among colors already on the books, for the Table/Map/Compare
 * swatches that need one grade → one color.
 */
import { AQI_CONFIG } from '../config/aqi';
import type { PM25Grade } from '../../types/data';

const GRADE_HEX: Record<PM25Grade, string> = {
  Good: AQI_CONFIG.AQI_GRADE_COLORS.GOOD,
  Moderate: AQI_CONFIG.AQI_GRADE_COLORS.MODERATE,
  Unhealthy: AQI_CONFIG.AQI_GRADE_COLORS.UNHEALTHY,
  'Very Unhealthy': AQI_CONFIG.AQI_GRADE_COLORS.VERY_UNHEALTHY,
};

/** Unknown/absent grade renders the same neutral hex the AQI scale reserves for it. */
export function gradeToHex(grade: PM25Grade | null | undefined): string {
  return grade ? GRADE_HEX[grade] : AQI_CONFIG.AQI_GRADE_COLORS.UNKNOWN;
}

/**
 * Mirrors the private `gradeFromPm25` cut (15/35/75 µg/m³) in
 * `api/gridSnapshot.ts` — that function isn't exported, and the grid artifact
 * itself only carries a raw `pm25` number, not a grade. Used for swatches on
 * selections (e.g. Compare tray pins) that didn't come through the grid
 * snapshot's own ranking response. If the 15/35/75 cut ever changes, change
 * it in both places.
 */
export function pm25ToGrade(pm25: number): PM25Grade {
  if (pm25 <= 15) return 'Good';
  if (pm25 <= 35) return 'Moderate';
  if (pm25 <= 75) return 'Unhealthy';
  return 'Very Unhealthy';
}
