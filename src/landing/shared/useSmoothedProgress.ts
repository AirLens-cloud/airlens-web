// useSmoothedProgress — wraps a chapter's raw scroll-progress ref
// (`useChapterProgress`'s `progressRef`) in a spring, so a per-frame reader
// (a scene's `useFrame`, or a canvas-slot passthrough) gets a smoothed value
// that lags and settles into scroll position instead of snapping to it
// exactly every frame — the "descent scrub inertia" feel (Wave 4 P2).
//
// Deliberately ref-based, not state-based: this hook must not trigger a
// re-render of the chapter tree on every animation frame (same "no React
// re-render" contract `useSpring`/`useChapterProgress.progressRef` already
// keep). A `requestAnimationFrame` loop reads the input ref every frame and
// feeds it to the spring as a moving target — the spring's own settle
// detection (see `SpringEngine`) means the engine goes idle once scrolling
// stops and the smoothed value has caught up.
import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { useSpring } from '../../motion/useSpring'
import type { SpringConfig } from '../../motion/spring'
import { useReducedMotion } from './perf/useReducedMotion'

/** Critically damped (no overshoot) — a scroll-progress smoothing utility
 * has to stay inside the same [0, 1] range its input does; a bouncy
 * (underdamped) config would let the smoothed value overshoot past 0 or 1
 * on a fast scroll, which no consumer of a "progress" value expects. */
const DEFAULT_CONFIG: SpringConfig = { damping: 1, response: 0.25 }

export function useSmoothedProgress(
  progressRef: MutableRefObject<number>,
  config: SpringConfig = DEFAULT_CONFIG,
): MutableRefObject<number> {
  const reduced = useReducedMotion()
  // `progressRef.current` can't be read here (react-hooks/refs — ref reads
  // are only allowed outside render) — both start at a 0 sentinel and are
  // synced to the real starting value in the mount-only layout effect below,
  // before paint, so there is no visible jump-from-0 flash.
  const spring = useSpring(0, config)
  const smoothedRef = useRef(0)

  useLayoutEffect(() => {
    spring.jump(progressRef.current)
    smoothedRef.current = progressRef.current
    // Mount-only sync — deliberately not re-run on scroll updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => spring.subscribe((v) => { smoothedRef.current = v }), [spring])

  useEffect(() => {
    // Reduced motion: useSpring already jumps instead of animating, but
    // there is still no reason to run a rAF poll loop at all here — read the
    // input ref straight through, one time, and leave smoothedRef pinned to
    // it. `reduced` cannot change mid-scroll-frame (it is a media-query
    // subscription that re-renders this hook when it flips), so this effect
    // re-running on that change is enough to pick reduced mode back up.
    if (reduced) {
      smoothedRef.current = progressRef.current
      return
    }
    let raf = 0
    const loop = () => {
      spring.set(progressRef.current)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [progressRef, spring, reduced])

  return reduced ? progressRef : smoothedRef
}
