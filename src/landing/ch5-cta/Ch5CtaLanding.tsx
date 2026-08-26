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
import { useMemo } from 'react'
import AtmosphericBackground from '../../components/AtmosphericBackground'
import { useSnapshotStamp } from './useSnapshotStamp'
import './ch5-cta.css'

export default function Ch5CtaLanding() {
  const stamp = useSnapshotStamp()
  const provenance = useMemo(
    () => `GEFS-Aerosols · FIRMS · AirLens tft-v2.0${stamp ? ` — snapshot ${stamp}` : ''}`,
    [stamp],
  )

  return (
    <div className="landing-canvas-slot">
      <div className="ch5-stage obs-surface">
        <AtmosphericBackground />

        <div className="ch5-content">
          <p className="ch5-tagline">
            보이지 않는 공기를, 보이게
            <span className="ch5-tagline__en">Making the invisible air visible.</span>
          </p>
          <a className="btn btn-light ch5-cta-btn" href="/globe">
            EXPLORE THE GLOBE ↗
          </a>
        </div>

        <p className="ch5-provenance m">{provenance}</p>
      </div>
    </div>
  )
}
