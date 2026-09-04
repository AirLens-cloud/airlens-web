import { useEffect, useState, type CSSProperties } from 'react'
import HomeHero from '../components/home/HomeHero'
import HomeForecastStrip from '../components/home/HomeForecastStrip'
import HomeWhyNow from '../components/home/HomeWhyNow'
import HomeActOnIt from '../components/home/HomeActOnIt'
import HomeStoriesResearch from '../components/home/HomeStoriesResearch'
import { useCapsuleData } from '../components/fluid/capsule/useCapsuleData'
import { useLocationPersonalization } from '../hooks/useLocationPersonalization'
import { STALE_THRESHOLD_MS } from '../lib/config/homeBriefing'
import { track } from '../lib/analytics'
import '../styles/home.css'

/**
 * Home — `/`. "Live Atmospheric Briefing" (approved mockup variant A,
 * "Instrument Band"): a full-width AQI-tinted hero with the current reading
 * for the forecast's "thickest air" city, a 24h PM2.5 strip, a below-
 * the-fold why-now/act-on-it row, and (further below, spec §4 anatomy's
 * final row) the Stories/Research block. This IS the briefing surface — it
 * does not mount FluidChrome's floating AqiCapsule (App.tsx), which would
 * duplicate the hero's own readout on the same screen.
 *
 * Below-the-fold DOM order follows the spec's semantic sequence — WHY NOW
 * (the judgment) before ACT ON IT (the action) — so screen-reader linear
 * order and desktop visual order agree. The mobile "CTA above the fold"
 * placement from the approved mockup is a visual-only lift in `home.css`
 * (`order: -1` under 640px); tab order is unaffected because the CTA link
 * is the only focusable element in this row either way.
 *
 * `HomeStoriesResearch` renders unconditionally (outside the `data.status
 * === 'ready'` gate) — it is editorial content (Field Notes + a Research
 * Commons teaser), not an AQI reading, so a missing/loading hero doesn't
 * withhold it.
 */
export default function Home() {
  const { choice, approx, requesting, denied, requestGeolocation, selectCity } = useLocationPersonalization()
  // Priority chain: a real opt-in choice beats the IP-approximate location,
  // which beats the feed's "thickest air" fallback pick. `locationSource`
  // carries which of the three won, so HomeHero can say so honestly (a
  // fallback pick and an approximate guess must never read as the same
  // thing — Glass-box) instead of collapsing to `data.isPersonalized`'s
  // coarser "was any coordinate personalized" boolean.
  const personalizedLocation = choice
    ? { lat: choice.lat, lon: choice.lon }
    : approx
      ? { lat: approx.lat, lon: approx.lon }
      : null
  const locationSource: 'user' | 'approx' | 'none' = choice ? 'user' : approx ? 'approx' : 'none'
  const data = useCapsuleData(personalizedLocation)
  // Read once, in a lazy initializer (React's documented escape hatch for a
  // one-time non-deterministic read) rather than calling `Date.now()`
  // directly in the render body, which the purity lint rule rejects.
  const [renderedAtMs] = useState(() => Date.now())

  useEffect(() => {
    if (data.status === 'loading') return
    if (data.status === 'missing') {
      track('home_state_shown', { status: 'error' })
      track('home_briefing_ready', { status: 'missing' })
      return
    }
    const isStale = renderedAtMs - new Date(data.updatedAt).getTime() > STALE_THRESHOLD_MS
    if (isStale) track('home_state_shown', { status: 'stale' })
    track('home_briefing_ready', { status: isStale ? 'stale' : 'ready' })
    // Re-fires only when the hook's status transitions (loading -> ready/missing),
    // not on every re-render — updatedAt is stable for the life of one ready state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.status])

  const coords = data.status === 'ready' ? { lat: data.lat, lon: data.lon } : null

  return (
    <main className="home-page">
      <div className="fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>
        <HomeHero
          data={data}
          nowMs={renderedAtMs}
          requestingLocation={requesting}
          locationDenied={denied}
          locationSource={locationSource}
          onRequestLocation={requestGeolocation}
          onSelectCity={selectCity}
        />
      </div>

      {data.status === 'ready' ? (
        <div className="home-shell fluid-enter" style={{ '--enter-i': 1 } as CSSProperties}>
          <HomeForecastStrip series={data.series24h} city={data.city} />
          <div className="home-below-fold">
            <HomeWhyNow series={data.series24h} />
            <HomeActOnIt coords={coords} />
          </div>
        </div>
      ) : null}

      <div className="fluid-enter" style={{ '--enter-i': 2 } as CSSProperties}>
        <HomeStoriesResearch />
      </div>

      <div className="home-flight-link">
        <a href="/landing">Take the flight →</a>
      </div>
    </main>
  )
}
