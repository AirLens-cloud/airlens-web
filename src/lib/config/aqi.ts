/**
 * AQI thresholds, grade colors, government keywords, DQSS scoring,
 * satellite constants, and data freshness configuration.
 */
import type { AqiSimpleTier, ForecastTierInfo } from '../../types/aqi';
import { VIZ_ACCENT_HEX } from './viz';

/**
 * AQI grade hex scale — inlined from the monorepo's `@airlens/design-tokens`
 * (`packages/design-tokens/src/aqi-grades.ts` v0.1.0), which this repo does not
 * depend on. Distinct from `lib/atmosphericBackgroundConfig.ts`' same-named
 * 3-key K4 subset: that one is the landing scene's desaturated palette, this is
 * the full 8-grade data scale. Keep the two apart — they answer different
 * questions and the keys are not interchangeable.
 */
const AQI_GRADE_HEX = {
  GOOD: '#10b981',
  MODERATE: '#f59e0b',
  USG: '#f97316',
  UNHEALTHY: '#ef4444',
  VERY_UNHEALTHY: '#7f1d1d',
  HAZARDOUS: '#6b21a8',
  UNKNOWN: '#64748b',
} as const;

export const AQI_CONFIG = {
  // Air Quality Thresholds (PM2.5 µg/m³) — remote-config overridable fallbacks.
  //
  // GOOD / VERY_UNHEALTHY follow the US EPA 2024 revision (12→9, 150→125), matching
  // ADVISORY_BANDS and AQ_SPIKES.THRESHOLDS. UNHEALTHY (75) is an AirLens-specific
  // value with no EPA breakpoint behind it and is left as-is.
  //
  // No runtime reader: the only consumer was pm25ToEpaHex(), removed alongside the
  // 2024 pass. What keeps this alive is the remote-config plumbing in
  // `lib/config/app.ts` (REMOTE_CONFIG_WHITELIST + REMOTE_CONFIG_VALIDATORS), which
  // references it by name. Give it a reader or retire both together — do not
  // silently drift it from the display bands above.
  AQI_THRESHOLDS: {
    GOOD: 9,
    MODERATE: 35,
    UNHEALTHY_SENSITIVE: 55,
    UNHEALTHY: 75,
    VERY_UNHEALTHY: 125,
  },

  // AQI Grade Colors — sourced from @airlens/design-tokens (v0.1.0)
  AQI_GRADE_COLORS: AQI_GRADE_HEX,

  // Keywords used to classify a station attribution source as government-operated
  DQSS_GOV_KEYWORDS: [
    'epa', 'ministry', 'government', 'national', 'federal',
    '환경부', 'airkorea', 'aqmd', 'defra', 'cpcb', 'mee.gov',
    'env.go', 'umweltbundesamt', 'lcsqa', 'arpa',
  ] as string[],

  // DQSS Scoring Parameters - Fallbacks
  DQSS: {
    BASE_SCORE: 40,
    FRESHNESS_MAX: 30,
    SOURCE_MULTIPLICITY_MAX: 20,
    VARIANCE_PENALTY_MAX: 20,
    SENSOR_TYPE_BONUS: {
      GOVERNMENT: 15, // +15 points for government-operated stations
      COMMUNITY: 0,
      UNKNOWN: 0,
    },
  },

  // Satellite Estimation Constants - Fallbacks
  SATELLITE: {
    AOD_PM25_RATIO: 120,
    DEFAULT_HUMIDITY: 0.65,
    SEASONAL_CORRECTION: {
      WINTER_LATE: 0.12, // Nov-Feb
      SUMMER: -0.05,
    },
  },

  // Data Freshness Thresholds (Today page progress bar)
  DATA_FRESHNESS: {
    STALE_THRESHOLD_MS: 300_000,      // 5 min — data considered stale
    COLLECTION_INTERVAL_MS: 30_000,   // 30s — expected refresh cycle
  },

  // DQSS Display Thresholds (Glass-box AI badge)
  DQSS_DISPLAY: {
    HIGH_THRESHOLD: 0.8,    // >= 0.8 → green "High" (0–1 scale, for normalized scores)
    MEDIUM_THRESHOLD: 0.5,  // >= 0.5 → yellow "Medium", else red "Low"
    // Percent-scale thresholds (0–100) used by SensorPanel, StationInfoPanel, AQISummaryBar
    HIGH_PCT: 75,           // >= 75 → High Confidence (green)
    MEDIUM_PCT: 45,         // >= 45 → Moderate (yellow), < 45 → Low Confidence (red)
    FALLBACK_COLOR: '#FFFF00',  // Badge color when badge_color is missing
  },

  // SHAP Explainability (Glass-box AI)
  SHAP: {
    TOP_K: 10,                        // Number of top features to display
    BAR_COLOR_POSITIVE: '#ef4444',    // Red — increases PM2.5
    BAR_COLOR_NEGATIVE: '#22c55e',    // Green — decreases PM2.5
    DATA_PATH: '/data/predictions/shap_values.json',
    TIMESERIES_SUFFIX: '_timeseries.json',
    SPARKLINE_DAYS: 7,
    SPARKLINE_WIDTH: 40,
    SPARKLINE_HEIGHT: 14,
    SPARKLINE_COLOR: '#60a5fa',
    MORE_DETAILS_ROUTE: '/analytics',
  },

  // Policy impact colors (used by PolicyMarkers, Globe)
  POLICY_IMPACT_COLORS: {
    UNKNOWN: '#94a3b8',
    STRONG_IMPROVE: '#10b981',  // <= -20%
    MILD_IMPROVE: VIZ_ACCENT_HEX,  // <= -5%
    NEUTRAL: '#f59e0b',         // <= +5%
    WORSEN: '#ef4444',          // > +5%
  },

  // DQSS Blur Effect (Globe post-processing — Phase 4)
  DQSS_BLUR: {
    THRESHOLD: 0.5,       // DQSS below this → blur applied
    MAX_BLUR_PX: 6,       // Maximum blur kernel radius (px)
    FADE_RANGE: 0.2,      // Smooth transition range around threshold
    TEXTURE_WIDTH: 512,   // DataTexture resolution
    TEXTURE_HEIGHT: 256,
    CHROMATIC_STRENGTH: 0.003,  // RGB channel offset for chromatic aberration (Phase A6)
    // Volume fog settings (Phase 3-7)
    VOLUME_DENSITY: 2.0,          // exponential fog density
    VOLUME_FOG_COLOR: [0.102, 0.102, 0.180], // RGB normalized (#1a1a2e)
    VOLUME_STRENGTH: 0.6,         // fog mix strength
  },

  // Confidence Band Colors (Chart.js — Phase 5)
  CONFIDENCE_BAND: {
    P10_P90_FILL: 'rgba(0, 78, 159, 0.06)',
    P25_P75_FILL: 'rgba(0, 78, 159, 0.14)',
    P50_LINE: '#004e9f',
    P50_LINE_WIDTH: 2,
  },

  // Country Card (Globe popup) — WHO PM2.5 guideline scale
  COUNTRY_CARD: {
    PM25_SCALE_MAX: 100,
    WHO_GUIDELINE: 15,
    GRADIENT_STOPS: [VIZ_ACCENT_HEX, '#e7ca7a', '#ff7a1a'],
    ACCENT_COLOR: VIZ_ACCENT_HEX,
    WHO_LABELS: [0, 15, 50, 100] as readonly number[],
  },
  // Simplified 4-tier PM2.5 thresholds (µg/m³) for UI tier labels
  SIMPLE_TIERS: {
    GOOD: 50,
    MOD: 100,
    USG: 200,
  },
  // Simplified 4-tier PM10 thresholds (µg/m³) — US EPA 24h category edges
  // (Good ≤54 / Moderate ≤154 / USG ≤254). PM10 runs ~2-4× the PM2.5
  // concentration for the same air quality category, so the PM2.5 tiers
  // must never be applied to PM10 values.
  SIMPLE_TIERS_PM10: {
    GOOD: 54,
    MOD: 154,
    USG: 254,
  },
} as const;

// ── AQI Tier Utilities (single source — no inline thresholds elsewhere) ──

function concentrationToSimpleTier(
  value: number,
  tiers: { readonly GOOD: number; readonly MOD: number; readonly USG: number },
): AqiSimpleTier {
  if (value <= tiers.GOOD) return 'good';
  if (value <= tiers.MOD) return 'mod';
  if (value <= tiers.USG) return 'usg';
  return 'haz';
}

function tierToInfo(tier: AqiSimpleTier): ForecastTierInfo {
  switch (tier) {
    // textColor = AA-safe ink for text on paper (mod/usg raw colors sit at
    // ~3:1 on light bg; --aqi-*-ink tokens carry the dark-mode override too).
    case 'good': return { label: 'GOOD', color: 'var(--aqi-good)', textColor: 'var(--aqi-good)' };
    case 'mod':  return { label: 'MOD',  color: 'var(--aqi-mod, #B58A2E)', textColor: 'var(--aqi-mod-ink, #8A6820)' };
    case 'usg':  return { label: 'USG',  color: 'var(--aqi-usg, #B86B2E)', textColor: 'var(--aqi-usg-ink, #96541E)' };
    case 'haz':  return { label: 'HAZ',  color: 'var(--aqi-haz, #4A1F4A)', textColor: 'var(--aqi-haz, #4A1F4A)' };
  }
}

export function pm25ToSimpleTier(pm25: number): AqiSimpleTier {
  return concentrationToSimpleTier(pm25, AQI_CONFIG.SIMPLE_TIERS);
}

export function pm25ToTierInfo(pm25: number): ForecastTierInfo {
  return tierToInfo(pm25ToSimpleTier(pm25));
}

export function pm10ToSimpleTier(pm10: number): AqiSimpleTier {
  return concentrationToSimpleTier(pm10, AQI_CONFIG.SIMPLE_TIERS_PM10);
}

export function pm10ToTierInfo(pm10: number): ForecastTierInfo {
  return tierToInfo(pm10ToSimpleTier(pm10));
}

// ── AQI → PM2.5 inverse (single source — no local AQI_TO_PM25_FACTOR/RATIO elsewhere) ──

/**
 * US EPA PM2.5 breakpoints, **pre-2024 table — deliberately not updated.**
 * [aqiLo, aqiHi, pmLo, pmHi].
 *
 * This is a *decoder*, not a classifier. `aqiToPm25()` below inverts it to recover
 * the PM2.5 concentration behind WAQI's integer `aqi` field, so the table has to
 * match whatever scale WAQI *encoded* with — not whatever scale is current. WAQI
 * publishes on the pre-2024 US EPA scale, so decoding with the 2024 table would
 * turn AQI 50 into 9.0 µg/m³ where the upstream meant 12.0: a systematic ~25%
 * under-read propagated into every consumer (AlertPulse, WindParticles,
 * ScalarFieldOverlay, stationParse, usePollutionSources).
 *
 * The site's *display* classification is a separate axis and does follow the 2024
 * revision — see AQI_THRESHOLDS above, GLOBE_CONFIG.AQ_SPIKES.THRESHOLDS, and
 * ADVISORY_BANDS in `healthAdvisory.ts`. Two tables coexisting in one repo is
 * intentional; they answer different questions.
 *
 * When to change this: only once WAQI itself moves to the 2024 breakpoints. The
 * signal is a step change in decoded PM2.5 against ground stations at the band
 * edges (a station reporting AQI 50 would start meaning 9.0, not 12.0) — or an
 * explicit WAQI changelog entry. `aqi.test.ts` pins the pre-2024 anchors, so it
 * failing is a deliberate-change gate, not noise.
 */
export const EPA_PM25_BREAKPOINTS: readonly (readonly [number, number, number, number])[] = [
  [0, 50, 0.0, 12.0],
  [51, 100, 12.1, 35.4],
  [101, 150, 35.5, 55.4],
  [151, 200, 55.5, 150.4],
  [201, 300, 150.5, 250.4],
  [301, 400, 250.5, 350.4],
  [401, 500, 350.5, 500.4],
] as const;

/**
 * Piecewise-linear inverse of EPA_PM25_BREAKPOINTS — converts a WAQI AQI value
 * back to the PM2.5 concentration that produced it. Replaces the flat
 * `aqi * 0.8` approximation previously duplicated across 6 Globe render layers.
 */
export function aqiToPm25(aqi: number): number {
  if (!Number.isFinite(aqi) || aqi <= 0) return EPA_PM25_BREAKPOINTS[0][2];
  for (const [aqiLo, aqiHi, pmLo, pmHi] of EPA_PM25_BREAKPOINTS) {
    if (aqi <= aqiHi) {
      // Clamp: breakpoints are discrete integer bands (50/51, 100/101, ...) but
      // aqi can be fractional. A fractional value landing in the 1-wide gap
      // between bands (e.g. 50.001) would otherwise extrapolate a negative t
      // into the next band and produce a non-monotonic dip below the prior
      // band's pmHi.
      const t = Math.max(0, Math.min(1, (aqi - aqiLo) / (aqiHi - aqiLo)));
      return pmLo + t * (pmHi - pmLo);
    }
  }
  return EPA_PM25_BREAKPOINTS[EPA_PM25_BREAKPOINTS.length - 1][3];
}
