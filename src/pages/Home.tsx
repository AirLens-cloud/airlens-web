import { useEffect, useState } from 'react'
import HomeHero from '../components/home/HomeHero'
import HomeForecastStrip from '../components/home/HomeForecastStrip'
import HomeWhyNow from '../components/home/HomeWhyNow'
import HomeActOnIt from '../components/home/HomeActOnIt'
import { useCapsuleData } from '../components/fluid/capsule/useCapsuleData'
import { STALE_THRESHOLD_MS } from '../lib/config/homeBriefing'
import { track } from '../lib/analytics'
import '../styles/home.css'

/**
 * Home — `/`. "Live Atmospheric Briefing" (approved mockup variant A,
 * "Instrument Band"): a full-width AQI-tinted hero with the current reading
 * for the forecast's "thickest air" city, a 24h PM2.5 strip, and a below-
 * the-fold why-now/act-on-it row. This IS the briefing surface — it does
 * not mount FluidChrome's floating AqiCapsule (App.tsx), which would
 * duplicate the hero's own readout on the same screen.
 *
 * Below-the-fold DOM order is CTA-then-why-now (not why-now-then-CTA): on
 * mobile that is the desired reading/tab order (CTAs reachable early,
 * "above the fold" per the approved mockup); on >=640px viewports
 * `home.css` uses `order` to place WHY NOW on the left / ACT ON IT on the
 * right without touching this DOM order or reading order.
 */
export default function Home() {
  const data = useCapsuleData()
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
      <HomeHero data={data} nowMs={renderedAtMs} />

      {data.status === 'ready' ? (
        <div className="home-shell">
          <HomeForecastStrip series={data.series24h} city={data.city} />
          <div className="home-below-fold">
            <HomeActOnIt coords={coords} />
            <HomeWhyNow series={data.series24h} />
          </div>
        </div>
      ) : null}

      <div className="home-flight-link">
        <a href="/landing">Take the flight →</a>
      </div>
    </main>
  )
}
