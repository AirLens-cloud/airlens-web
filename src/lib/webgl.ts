/**
 * WebGL capability probe for the Globe stage.
 *
 * The monorepo's `lib/webgl.ts` also carried `verifyGpuComputeSupport` for the
 * GPU particle lane; that lane is deferred with G3 and its consumer is absent
 * here, so this module is only the support question the stage actually asks:
 * can we mount a WebGL canvas at all, or do we owe the visitor the 2D fallback?
 *
 * The result is cached: creating probe contexts is not free, and on some
 * drivers repeated probes can exhaust the context pool the real canvas needs.
 */
let cached: boolean | null = null;

export function isWebGLSupported(): boolean {
  if (cached !== null) return cached;
  if (typeof document === 'undefined') {
    // SSR/prerender: don't cache — the browser pass must probe for real.
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    cached = !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    cached = false;
  }
  return cached;
}

/** Test seam — drops the memoized answer so a probe runs again. */
export function resetWebGLProbeCache(): void {
  cached = null;
}
