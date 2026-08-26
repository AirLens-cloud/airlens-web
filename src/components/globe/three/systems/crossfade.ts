/**
 * crossfade — pure timing/easing helpers for the P8b GEFS timeline dual-texture
 * cross-fade (ScalarFieldOverlay.tsx, V-W3).
 *
 * Glass-box boundary: this module never touches pixel *values* — it only computes
 * how far along (0..1) a fade between two already-fetched, real frame textures has
 * progressed. The two frames being blended are always two things that actually
 * exist (GEFS single deterministic member); no interpolated/fabricated frame is
 * ever created here. See ScalarFieldOverlay.tsx header for the full boundary note.
 *
 * Kept dependency-free (no THREE/R3F) so it is unit-testable without a WebGL
 * canvas — the R3F component itself cannot be unit-tested (see project test docs).
 */

/** Clamp to [0, 1]. */
function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/**
 * Cubic ease-out, `f(t) = 1 - (1-t)^3`. A closed-form JS stand-in for reado.css's
 * `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` — evaluating a cubic-bezier exactly
 * needs iterative root-finding, which is overkill for a 280ms opacity tween; this
 * shares the same "fast start, gentle settle" shape so the GPU tween and the CSS
 * motion in the rest of the page read as one system.
 */
export function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - (1 - c) ** 3;
}

/**
 * Cross-fade blend progress (0 = fully the old frame, 1 = fully the new frame) at
 * `elapsedMs` into a `durationMs`-long tween. Mirrors GLOBE_CONFIG.GLOBE_HEATMAP
 * .TIMELINE_CROSSFADE_MS (280ms — reado.css `--dur-base`) as the caller's default.
 */
export function computeBlend(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return easeOutCubic(elapsedMs / durationMs);
}

/** True once the blend has crossed its midpoint — the HUD timestamp snap point. */
export function isBlendMidpoint(blend: number): boolean {
  return blend >= 0.5;
}

/**
 * Which of two frames the HUD should report as "what you're looking at right now"
 * during a cross-fade. Deliberately binary (never "40% frame A / 60% frame B") —
 * the displayed timestamp must always have a single honest answer, snapping to the
 * incoming frame exactly at the visual halfway point of the fade.
 */
export function resolveDisplayedFrame<T>(blend: number, prev: T, next: T): T {
  return isBlendMidpoint(blend) ? next : prev;
}
