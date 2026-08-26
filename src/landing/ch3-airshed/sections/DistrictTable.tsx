// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/seoul/sections/DistrictTable.tsx` (Wave L3, 2026-08-26);
// `perf/useReducedMotion` import rebound to `../../shared/perf/useReducedMotion`.
// Classnames are prefixed `ch3-` (was bare `.seoul__table*`) so this chapter's
// CSS can't collide with a sibling chapter's.
import { useEffect, useMemo, useRef } from 'react'
import type { DistrictInfo } from '../types'
import { useReducedMotion } from '../../shared/perf/useReducedMotion'

// WHO 24-h guideline (15 µg/m³) and the US EPA sensitive-group breakpoint
// (35.5 µg/m³) — the same two thresholds projection.ts's color ramp bends at,
// so the table's "Level" column and the 3D slab's color always agree.
function levelOf(pm: number): 'Clean' | 'Elevated' | 'High' {
  if (pm <= 15) return 'Clean'
  if (pm <= 35.5) return 'Elevated'
  return 'High'
}

interface Props {
  districts: DistrictInfo[]
  hoveredCode: string | null
  selectedCode: string | null
  onHover: (code: string | null) => void
  onSelect: (code: string) => void
}

// The real, keyboard- and screen-reader-first equivalent of the 3D view: every
// district's number, ranked, with no data that isn't also on the slabs. Row
// selection is bidirectional with the 3D scene — selecting here highlights the
// district there, and clicking a district there scrolls its row into view here.
export default function DistrictTable({ districts, hoveredCode, selectedCode, onHover, onSelect }: Props) {
  const reduced = useReducedMotion()
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  const ranked = useMemo(() => [...districts].sort((a, b) => b.pm25 - a.pm25), [districts])

  useEffect(() => {
    if (!selectedCode) return
    rowRefs.current[selectedCode]?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [selectedCode, reduced])

  return (
    <div className="ch3-table-wrap">
      <table className="ch3-table">
        <caption className="ch3-table-caption">
          Seoul's 25 districts, interpolated PM2.5 this snapshot — highest first
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">District</th>
            <th scope="col">PM2.5 (µg/m³)</th>
            <th scope="col">Level</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((d, i) => {
            const active = d.code === selectedCode || d.code === hoveredCode
            const level = levelOf(d.pm25)
            return (
              <tr
                key={d.code}
                ref={(el) => {
                  rowRefs.current[d.code] = el
                }}
                aria-selected={d.code === selectedCode}
                className={active ? 'is-active' : undefined}
                onMouseEnter={() => onHover(d.code)}
                onMouseLeave={() => onHover(null)}
              >
                <td className="ch3-table-num">{i + 1}</td>
                <td>
                  <button
                    type="button"
                    className="ch3-table-btn"
                    aria-pressed={d.code === selectedCode}
                    onClick={() => onSelect(d.code)}
                    onFocus={() => onHover(d.code)}
                    onBlur={() => onHover(null)}
                  >
                    {d.nameEng}
                    <span className="ch3-table-ko" lang="ko">
                      {d.name}
                    </span>
                  </button>
                </td>
                <td className="ch3-table-num">{d.pm25.toFixed(1)}</td>
                <td>
                  <span className={`ch3-table-level ch3-table-level--${level.toLowerCase()}`}>{level}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
