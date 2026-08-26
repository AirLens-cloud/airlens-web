/**
 * Immersive data-viz accent — single source (core-rules §3-1).
 * CSS mirror: reado.css --viz-accent. Viz only, NOT brand chrome; actions use --orange.
 */
export const VIZ_ACCENT_HEX = '#25e2f4' as const;
export const VIZ_ACCENT_0X = 0x25e2f4;
/** rgb triple of VIZ_ACCENT_HEX — keep in sync with the hex above. */
export const vizAccentRgba = (alpha: number): string => `rgba(37, 226, 244, ${alpha})`;
