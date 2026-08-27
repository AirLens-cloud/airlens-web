import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { projectMomentum, rubberband } from '../../../motion/spring'
import { useSpring } from '../../../motion/useSpring'
import AqiDot from '../../wireframe/AqiDot'
import type { CapsuleDataReady } from './useCapsuleData'

export interface CapsulePanelProps {
  data: CapsuleDataReady
  /** Content width in px — one drag page's travel distance. */
  contentWidth: number
}

const DRAG_SPRING = { damping: 0.72, response: 0.32 }
const SPARK_W = 260
const SPARK_H = 64

const TIER_LABEL: Record<CapsuleDataReady['tier'], string> = {
  good: 'GOOD',
  moderate: 'MODERATE',
  usg: 'UNHEALTHY (SENSITIVE)',
  unhealthy: 'UNHEALTHY',
  'very-unhealthy': 'VERY UNHEALTHY',
  hazardous: 'HAZARDOUS',
  unknown: '—',
}

interface SparkGeometry {
  areaPoints: string
  linePoints: string
  endX: number
  endY: number
}

function buildSparkline(series: CapsuleDataReady['series24h'], w: number, h: number): SparkGeometry | null {
  if (series.length === 0) return null
  const values = series.flatMap((p) => [p.p10 ?? p.p50, p.p90 ?? p.p50, p.p50])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (i: number) => (i / Math.max(1, series.length - 1)) * w
  const y = (v: number) => h - ((v - min) / span) * h

  const top = series.map((p, i) => `${x(i)},${y(p.p90 ?? p.p50)}`)
  const bottom = series
    .map((p, i) => [x(i), y(p.p10 ?? p.p50)] as const)
    .reverse()
    .map(([px, py]) => `${px},${py}`)
  const last = series[series.length - 1]

  return {
    areaPoints: [...top, ...bottom].join(' '),
    linePoints: series.map((p, i) => `${x(i)},${y(p.p50)}`).join(' '),
    endX: x(series.length - 1),
    endY: y(last.p50),
  }
}

/**
 * CapsulePanel — 2-page swipeable report (current + range, then a 24h
 * sparkline). Horizontal drag with pointer capture, rubberband resistance
 * past the edges, and a momentum-projected snap to the nearer page.
 */
export default function CapsulePanel({ data, contentWidth }: CapsulePanelProps): ReactNode {
  const [page, setPage] = useState(0)
  const translateX = useSpring(0, DRAG_SPRING)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef({ startX: 0, startTranslate: 0, lastX: 0, lastT: 0, velocity: 0, dragging: false })

  useEffect(() => {
    const apply = (v: number) => {
      if (trackRef.current) trackRef.current.style.transform = `translate3d(${v}px,0,0)`
    }
    apply(translateX.get())
    return translateX.subscribe(apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function goToPage(next: number, velocity = 0): void {
    const clamped = Math.max(0, Math.min(1, next))
    setPage(clamped)
    translateX.set(-clamped * contentWidth, { velocity })
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startTranslate: translateX.get(),
      lastX: e.clientX,
      lastT: performance.now(),
      velocity: 0,
      dragging: true,
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>): void {
    const d = dragRef.current
    if (!d.dragging) return
    const dx = e.clientX - d.startX
    let next = d.startTranslate + dx
    if (next > 0) next = rubberband(next)
    if (next < -contentWidth) next = -contentWidth - rubberband(-contentWidth - next)
    if (trackRef.current) trackRef.current.style.transform = `translate3d(${next}px,0,0)`

    const now = performance.now()
    const dt = now - d.lastT
    if (dt > 0) d.velocity = ((e.clientX - d.lastX) / dt) * 1000
    d.lastX = e.clientX
    d.lastT = now
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>): void {
    const d = dragRef.current
    if (!d.dragging) return
    d.dragging = false
    const current = d.startTranslate + (e.clientX - d.startX)
    const projected = current + projectMomentum(d.velocity)
    goToPage(projected < -contentWidth / 2 ? 1 : 0, d.velocity)
  }

  const spark = buildSparkline(data.series24h, SPARK_W, SPARK_H)

  return (
    <div className="aq-capsule-panel" style={{ width: contentWidth }}>
      <div
        className="aq-capsule-panel__viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={trackRef} className="aq-capsule-panel__track">
          <div className="aq-capsule-panel__page" style={{ width: contentWidth }}>
            <div className="aq-capsule-panel__current">
              <AqiDot tier={data.tier} size={12} />
              <span className="aq-capsule-panel__current-value">{Math.round(data.current)}</span>
              <span className="aq-capsule-panel__current-unit">µg/m³</span>
            </div>
            <div className="aq-capsule-panel__tier-chip" data-tier={data.tier}>
              {TIER_LABEL[data.tier]}
            </div>
            <p className="aq-capsule-panel__range">
              {data.range
                ? `Expected today: ${Math.round(data.range.lo)}–${Math.round(data.range.hi)} µg/m³`
                : 'No uncertainty band published for this forecast'}
            </p>
            <p className="aq-capsule-panel__meta">{data.city}</p>
          </div>
          <div className="aq-capsule-panel__page" style={{ width: contentWidth }}>
            <p className="aq-capsule-panel__meta">
              {data.range ? '24h forecast · expected range' : '24h forecast · single value, no band'}
            </p>
            {spark ? (
              <svg
                viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                className="aq-capsule-panel__spark"
                role="img"
                aria-label={
                  data.range
                    ? '24-hour PM2.5 forecast with shaded expected range'
                    : '24-hour PM2.5 forecast, no uncertainty band published'
                }
              >
                <polygon points={spark.areaPoints} className="aq-capsule-panel__spark-area" />
                <polyline points={spark.linePoints} className="aq-capsule-panel__spark-line" fill="none" />
                <circle cx={spark.endX} cy={spark.endY} r={3} className="aq-capsule-panel__spark-dot" />
              </svg>
            ) : (
              <p className="aq-capsule-panel__meta">NO FEED</p>
            )}
          </div>
        </div>
      </div>
      <div className="aq-capsule-panel__dots">
        {[0, 1].map((i) => (
          <button
            key={i}
            type="button"
            className={
              page === i ? 'aq-capsule-panel__dot aq-capsule-panel__dot--active' : 'aq-capsule-panel__dot'
            }
            aria-label={`Page ${i + 1} of 2`}
            aria-current={page === i}
            onClick={() => goToPage(i)}
          />
        ))}
      </div>
    </div>
  )
}
