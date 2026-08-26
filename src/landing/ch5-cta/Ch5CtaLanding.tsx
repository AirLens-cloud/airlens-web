/**
 * Ch5CtaLanding — Chapter 5, the flight's final beat: back to the void (the
 * source repo's own Home.tsx comment names this exact sequence — "the
 * briefing room (Paper-Ink) and the final CTA (void)") for one tagline and
 * one call to action.
 *
 * `three`/`@react-three/fiber`-free, per the Wave L4 brief — `AtmosphericBackground`
 * is a Canvas 2D drift-particle field (`src/components/AtmosphericBackground.tsx`),
 * already used elsewhere in this repo (`/design` gallery) without either
 * package. It has no `surface`/theme prop — it self-reads
 * `document.documentElement.dataset.surface` (a signal this repo's flight
 * never sets), so it always renders its default "paper" particle behavior;
 * that's fine here, it's still just a subtle Canvas 2D drift field, and this
 * chapter's own dark background is what carries the "void" look, not the
 * canvas.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import AtmosphericBackground from '../../components/AtmosphericBackground'
import SkyOrb from '../../components/fluid/SkyOrb'
import { loadTft } from '../shared/data/loaders'
import { useSnapshotStamp } from './useSnapshotStamp'
import './ch5-cta.css'

/**
 * Chapter-local "current PM2.5" pick — same "thickest air first" city
 * selection as `useCapsuleData`'s `pickFeaturedCity` / Ch4's
 * `forecastRowAt48h`, independently implemented per the wave brief (a
 * chapter-internal helper is not promoted/shared just because the same
 * small selection shows up a third time). `null` while unresolved or on a
 * fetch failure — `SkyOrb` is only mounted once a real reading exists (see
 * below), never fed a fabricated number.
 */
function useCurrentPm25(): number | null {
  const [value, setValue] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    loadTft()
      .then((tft) => {
        if (!alive) return
        let best: number | null = null
        for (const city of tft.cities) {
          const now = city.hourly[0]
          if (!now || !Number.isFinite(now.pm25)) continue
          if (best === null || now.pm25 > best) best = now.pm25
        }
        setValue(best)
      })
      .catch(() => {
        // Honesty over a rendered orb: leave value null (see the missing-data
        // branch below, and useSnapshotStamp's identical rationale).
      })
    return () => {
      alive = false
    }
  }, [])

  return value
}

export default function Ch5CtaLanding() {
  const stamp = useSnapshotStamp()
  const currentPm25 = useCurrentPm25()
  const provenance = useMemo(
    () => `GEFS-Aerosols · FIRMS · AirLens tft-v2.0${stamp ? ` — snapshot ${stamp}` : ''}`,
    [stamp],
  )

  return (
    <div className="landing-canvas-slot">
      <div className="ch5-stage obs-surface">
        <AtmosphericBackground />

        <div className="ch5-content">
          <div className="ch5-tagline-row">
            <p className="ch5-tagline fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>
              보이지 않는 공기를, 보이게
              <span className="ch5-tagline__en">Making the invisible air visible.</span>
            </p>
            {/* Foreground accent orb — omitted entirely (not a neutral-ambient
                fallback) when there is no real current reading to visualize. */}
            {currentPm25 !== null && <SkyOrb pm25={currentPm25} className="ch5-tagline__orb" />}
          </div>
          <a
            className="btn btn-light ch5-cta-btn fluid-enter"
            style={{ '--enter-i': 1 } as CSSProperties}
            href="/globe"
          >
            EXPLORE THE GLOBE ↗
          </a>
        </div>

        <p className="ch5-provenance m">{provenance}</p>
      </div>
    </div>
  )
}
