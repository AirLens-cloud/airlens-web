import { useEffect, type CSSProperties } from 'react'
import HomeHero from '../components/home/HomeHero'
import HomeTrustStrip from '../components/home/HomeTrustStrip'
import HomeForecastStrip from '../components/home/HomeForecastStrip'
import HomeWhyNow from '../components/home/HomeWhyNow'
import HomeActOnIt from '../components/home/HomeActOnIt'
import HomeStoriesResearch from '../components/home/HomeStoriesResearch'
import { useCapsuleData } from '../components/fluid/capsule/useCapsuleData'
import { useResolvedLocation } from '../hooks/useResolvedLocation'
import { usePrimaryReading } from '../hooks/usePrimaryReading'
import { useNow } from '../hooks/useNow'
import { LOCATING_LABEL } from '../lib/location/resolveLocation'
import { track } from '../lib/analytics'
import '../styles/home.css'

/**
 * Home — `/`. "Live Atmospheric Briefing" (approved mockup variant A,
 * "Instrument Band"): a full-width AQI-tinted hero with the current reading
 * for the visitor's resolved location (W1a — `useResolvedLocation`; Seoul,
 * honestly labeled, until a real choice or the IP-approximate lookup
 * resolves), a 24h PM2.5 strip, a below-the-fold why-now/act-on-it row, and
 * (further below, spec §4 anatomy's final row) the Stories/Research block.
 * This IS the briefing surface — it
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
  const { location, requesting, denied, requestGeolocation, selectCity } = useResolvedLocation()
  // `location` is `null` only while genuinely still resolving (no choice,
  // approximate lookup not settled yet) — `useCapsuleData`/`usePrimaryReading`
  // already report their own loading state for that. Once resolved,
  // `location.source` says which of choice/approx/Seoul-default won, so
  // HomeHero can word the eyebrow/fallback-band honestly instead of a single
  // "was this personalized" boolean.
  const data = useCapsuleData(location)
  // A ticking clock (GNET1), not a mount-time snapshot — the hero's
  // "Updated … ago", its TrustLine data age and the trust strip keep growing
  // while the tab stays open.
  const nowMs = useNow()
  // The hero's headline (W1b commit ②) — the same shared resolver `/today`
  // uses, so Home never shows a different number than /today or the floating
  // capsule for the same place and moment. `data` above stays wired to the
  // CAMS-only 24h outlook row (`HomeForecastStrip`/`HomeWhyNow`), which keeps
  // its own gate below — the outlook is allowed to lag the headline.
  const { reading } = usePrimaryReading(location, nowMs)

  useEffect(() => {
    if (reading.status === 'loading') return
    if (reading.status === 'unavailable') {
      track('home_state_shown', { status: 'error' })
      track('home_briefing_ready', { status: 'missing' })
      return
    }
    // Same verdict the hero renders (`reading.stale`), never a cadence
    // compare — telemetry must not report "stale" while the UI shows fresh.
    if (reading.stale) track('home_state_shown', { status: 'stale' })
    track('home_briefing_ready', { status: reading.stale ? 'stale' : 'ready', source: reading.source })
    // Re-fires only when the hook's status transitions (loading -> ready/
    // unavailable), not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading.status])

  // The user's own resolved point — HomeTrustStrip's nearest-station lookup
  // and HomeActOnIt's Globe deep link both center on where the visitor
  // actually is, never the CAMS feed city `data` resolves to.
  const coords = location ? { lat: location.lat, lon: location.lon } : null
  const placeLabel = location?.label ?? LOCATING_LABEL

  return (
    <main className="home-page">
      <div className="fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>
        <HomeHero
          reading={reading}
          data={data}
          requestingLocation={requesting}
          locationDenied={denied}
          placeLabel={placeLabel}
          locationSource={location?.source ?? null}
          onRequestLocation={requestGeolocation}
          onSelectCity={selectCity}
        />
        {reading.status === 'ready' && (
          <HomeTrustStrip coords={coords} updatedAt={reading.updatedAtIso} nowMs={nowMs} />
        )}
      </div>

      {/* The CAMS outlook rows gate on `data`; the Globe CTA only needs the
          visitor's point, so it shows with the headline even when the city
          forecast is down. */}
      {data.status === 'ready' || reading.status === 'ready' ? (
        <div className="home-shell fluid-enter" style={{ '--enter-i': 1 } as CSSProperties}>
          {data.status === 'ready' && <HomeForecastStrip series={data.series24h} city={data.city} />}
          <div className="home-below-fold">
            {data.status === 'ready' && <HomeWhyNow series={data.series24h} city={data.city} />}
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
