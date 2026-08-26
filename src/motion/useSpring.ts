import { useEffect, useRef, useState } from 'react'
import { Spring, SpringEngine, type SpringConfig } from './spring'
import { useReducedMotion } from '../landing/shared/perf/useReducedMotion'

export interface UseSpringHandle {
  get(): number
  set(target: number, opts?: { velocity?: number }): void
  jump(value: number): void
  subscribe(cb: (value: number) => void): () => void
}

/**
 * Imperative spring handle — deliberately does not trigger React re-renders.
 * Consumers subscribe and write the value straight to a DOM/style ref.
 */
export function useSpring(initial: number, cfg: SpringConfig): UseSpringHandle {
  const { damping, response } = cfg
  const reduced = useReducedMotion()
  const springRef = useRef<Spring | null>(null)
  const listenersRef = useRef(new Set<(value: number) => void>())
  const reducedRef = useRef(reduced)

  if (springRef.current === null) {
    springRef.current = new Spring(initial, cfg)
  }

  useEffect(() => {
    reducedRef.current = reduced
  }, [reduced])

  // Single tickable per spring instance — re-adding it to the engine on every
  // `set()` call is safe (Set dedupes), and avoids spawning a new closure per
  // call that would double-step the same spring. useState's lazy initializer
  // (not useRef + render-time assignment) keeps this out of the render body.
  const [tickable] = useState(() => ({
    step(dtSec: number) {
      const spring = springRef.current!
      const settled = spring.step(dtSec)
      for (const cb of listenersRef.current) cb(spring.get())
      return settled
    },
  }))

  useEffect(() => {
    springRef.current?.setConfig({ damping, response })
  }, [damping, response])

  useEffect(() => {
    return () => {
      SpringEngine.remove(tickable)
    }
  }, [tickable])

  return {
    get: () => springRef.current!.get(),
    set: (target, opts) => {
      const spring = springRef.current!
      if (reducedRef.current) {
        spring.jump(target)
        for (const cb of listenersRef.current) cb(spring.get())
        return
      }
      spring.setTarget(target, opts)
      SpringEngine.add(tickable)
    },
    jump: (value) => {
      const spring = springRef.current!
      spring.jump(value)
      for (const cb of listenersRef.current) cb(spring.get())
    },
    subscribe: (cb) => {
      listenersRef.current.add(cb)
      return () => listenersRef.current.delete(cb)
    },
  }
}
