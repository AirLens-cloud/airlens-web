// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/particulate/capability.ts` (Wave L2, 2026-08-26); import path
// updated for this repo's shallower `src/landing/` nesting.
import type { FieldMode } from './types'
import type { QualityTier } from '../shared/perf/types'

/**
 * What the flow field actually needs is a WebGL2 context — nothing more.
 *
 * This probe used to gate on `EXT_color_buffer_float`, which the original design did need:
 * particle positions lived in a float ping-pong target. That design was abandoned (a float
 * texture cannot be reliably fetched from a *vertex* shader — it silently returns (0,0,0,1)
 * on some GL implementations, which rendered an empty sky). The semi-Lagrangian field that
 * replaced it advects in the fragment shader, renders into an RGBA/UnsignedByte target, and
 * reads wind from an RG16F texture — filterable in core WebGL2 with no extension at all.
 * Keeping the old probe only turned working GPUs away.
 */
export function supportsGpuField(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** `?field=gpu|fallback` forces a path so the fallback can be exercised on a machine that supports both. */
export function forcedMode(search: string): FieldMode | null {
  const v = new URLSearchParams(search).get('field')
  return v === 'gpu' || v === 'fallback' ? v : null
}

export function resolveFieldMode(tier: QualityTier, search: string): FieldMode {
  const forced = forcedMode(search)
  if (forced) return forced
  if (tier === 'low') return 'fallback'
  return supportsGpuField() ? 'gpu' : 'fallback'
}
