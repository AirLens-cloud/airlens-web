// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/seoul/capability.ts` (Wave L3, 2026-08-26).
//
// The scene needs ExtrudeGeometry, InstancedMesh, and vertex-colored line
// segments — all core WebGL1 features. Probing for WebGL2 first (r3f's default
// context) with a WebGL1 fallback covers everything except a truly WebGL-less
// browser, which gets the honest error panel instead of a blank canvas.
export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return false
    ;(gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}
