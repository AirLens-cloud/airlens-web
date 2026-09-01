import WfDisabledCta from '../wireframe/WfDisabledCta'
import { track } from '../../lib/analytics'

export interface HomeActOnItProps {
  /** Featured city's coordinates, when the hero has resolved ready data —
   * appended to the Globe deep link so it opens centered there. Omitted
   * (plain `/globe`) when data isn't ready yet. */
  coords: { lat: number; lon: number } | null
}

/**
 * HomeActOnIt — right column of the below-the-fold row: the two CTAs. "Open
 * in Lab" is disabled (feasibility review, not shipped) — built on
 * `WfDisabledCta` so a future Datasets page CTA can reuse the same
 * component rather than re-implementing the dashed/muted treatment.
 */
export default function HomeActOnIt({ coords }: HomeActOnItProps) {
  const globeHref = coords ? `/globe?lat=${coords.lat}&lon=${coords.lon}` : '/globe'

  return (
    <div className="home-act-on-it">
      <h2 className="t-tag">Act on it</h2>
      <div className="home-act-on-it__ctas">
        <a
          className="home-act-on-it__primary"
          href={globeHref}
          onClick={() => track('home_cta_explore')}
        >
          Explore this atmosphere ↗
        </a>
        <WfDisabledCta
          label="Open in Lab"
          note="Lab is in feasibility review — not yet available."
          testId="home-cta-lab"
        />
      </div>
    </div>
  )
}
