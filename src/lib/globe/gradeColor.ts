/**
 * gradeColor — `PM25Grade` (the 15/35/75 grid-cell cut in `api/gridSnapshot.ts`)
 * to the existing AQI grade hex scale (`lib/config/aqi.ts`). No new palette:
 * this only picks among colors already on the books, for the Table/Map/Compare
 * swatches that need one grade → one color.
 */
import { AQI_CONFIG } from '../config/aqi';
import { gradeFromPm25 } from '../../api/gridSnapshot';
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
 * Reuses `api/gridSnapshot.ts`'s exported `gradeFromPm25` cut (15/35/75
 * µg/m³) — the grid artifact only carries a raw `pm25` number, not a grade,
 * so this exists for swatches on selections (e.g. Compare tray pins) that
 * didn't come through the grid snapshot's own ranking response. Kept under
 * its own name here since callers (`pages/Globe.tsx`) reach for it as "grade
 * for whatever pm25 I have," not as a gridSnapshot-specific concern.
 */
export const pm25ToGrade: (pm25: number) => PM25Grade = gradeFromPm25;
