import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, Ref } from 'react'
import { buildDisplacementMap } from './displacementMap'
import { detectGlassTier } from './glassTier'

export interface LiquidGlassProps {
  radius?: number
  bezel?: number
  variant?: 'day' | 'night'
  as?: 'div' | 'section' | 'article' | 'aside'
  className?: string
  children?: ReactNode
}

const RESIZE_DEBOUNCE_MS = 150

/**
 * LiquidGlass — a glass-material surface with three fallback tiers
 * (see glassTier.ts): SVG-filter refraction on Chromium, a plain
 * backdrop-filter blur elsewhere it's supported, or a flat tint everywhere
 * else. The refraction filter's displacement map is regenerated (debounced)
 * whenever the surface is resized.
 */
export default function LiquidGlass({
  radius = 20,
  bezel = 34,
  variant = 'day',
  as = 'div',
  className,
  children,
}: LiquidGlassProps): ReactNode {
  const filterId = useId()
  const surfaceRef = useRef<HTMLElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const tier = detectGlassTier()

  useEffect(() => {
    const el = surfaceRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    let timer: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        setSize({ width: Math.round(width), height: Math.round(height) })
      }, RESIZE_DEBOUNCE_MS)
    })
    ro.observe(el)

    return () => {
      if (timer) clearTimeout(timer)
      ro.disconnect()
    }
  }, [])

  const hasSize = size.width > 0 && size.height > 0
  const classes = ['liquid-glass', `liquid-glass--${tier}`, `liquid-glass--${variant}`]
  if (className) classes.push(className)

  const style: CSSProperties = { borderRadius: `${radius}px` }
  if (tier === 'refract' && hasSize) {
    style.backdropFilter = `url(#${filterId}) saturate(1.25)`
  }

  const surfaceClassName = classes.join(' ')
  const surfaceRefProp = surfaceRef as Ref<HTMLElement>
  let surface: ReactNode
  switch (as) {
    case 'section':
      surface = (
        <section ref={surfaceRefProp} className={surfaceClassName} style={style}>
          {children}
        </section>
      )
      break
    case 'article':
      surface = (
        <article ref={surfaceRefProp} className={surfaceClassName} style={style}>
          {children}
        </article>
      )
      break
    case 'aside':
      surface = (
        <aside ref={surfaceRefProp} className={surfaceClassName} style={style}>
          {children}
        </aside>
      )
      break
    default:
      surface = (
        <div ref={surfaceRef as Ref<HTMLDivElement>} className={surfaceClassName} style={style}>
          {children}
        </div>
      )
  }

  if (tier !== 'refract') return surface

  const mapUrl = hasSize ? buildDisplacementMap(size.width, size.height, radius, bezel) : ''

  return (
    <>
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blurred" />
          {mapUrl && (
            <feImage href={mapUrl} x="0" y="0" width={size.width} height={size.height} result="displacementMap" />
          )}
          <feDisplacementMap
            in="blurred"
            in2="displacementMap"
            scale="42"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
      {surface}
    </>
  )
}
