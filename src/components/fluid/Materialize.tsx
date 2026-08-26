import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useReducedMotion } from '../../landing/shared/perf/useReducedMotion'

export interface MaterializeProps {
  show: boolean
  origin?: string
  durMs?: number
  className?: string
  children?: ReactNode
}

const DEFAULT_DUR_MS = 340
/** Grace period past the transition duration before the safety-timeout unmount fires. */
const UNMOUNT_GRACE_MS = 50

/**
 * Materialize — opacity/scale/blur "condense in, dissolve out" wrapper.
 * Mounts before entering (so the closed state paints first and the
 * transition to `--entered` has something to animate from), and stays
 * mounted through the close transition before unmounting — driven by
 * `onTransitionEnd`, with a timeout as a fallback in case that event is
 * missed (interrupted transition, no-transition edge cases).
 */
export default function Materialize({
  show,
  origin = 'center',
  durMs = DEFAULT_DUR_MS,
  className,
  children,
}: MaterializeProps): ReactNode {
  const reduced = useReducedMotion()
  const [prevShow, setPrevShow] = useState(show)
  const [mounted, setMounted] = useState(show)
  const [entered, setEntered] = useState(show)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Adjust state during render when `show` changes (same pattern as
  // useAnchorRect.ts) rather than in an effect — the two effects below then
  // only ever call setState from a nested rAF/timeout callback, never
  // synchronously from the effect body itself.
  if (show !== prevShow) {
    setPrevShow(show)
    if (show) {
      setMounted(true)
    } else {
      setEntered(false)
    }
  }

  useEffect(() => {
    if (!show || entered) return
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [show, entered])

  useEffect(() => {
    if (show || !mounted) return
    timeoutRef.current = setTimeout(() => setMounted(false), durMs + UNMOUNT_GRACE_MS)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [show, mounted, durMs])

  if (!mounted) return null

  const classes = ['fluid-materialize']
  if (entered) classes.push('fluid-materialize--entered')
  if (reduced) classes.push('fluid-materialize--reduced')
  if (className) classes.push(className)

  const style: CSSProperties = {
    transitionDuration: `${durMs}ms`,
    transformOrigin: origin,
  }

  return (
    <div
      className={classes.join(' ')}
      style={style}
      onTransitionEnd={(e) => {
        if (e.target !== e.currentTarget || show) return
        setMounted(false)
      }}
    >
      {children}
    </div>
  )
}
