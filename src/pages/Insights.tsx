/**
 * Insights — /insights. The SDID policy-impact hub.
 *
 * Six bands, in the order the approved I0 layout gate fixed:
 *   1. headline ATT for the selected country
 *   2. cross-check lanes + national standards (one band, two panels)
 *   3. the regional observation map, full width
 *   4. the synthetic-control curve
 *   5. the observed trend with its measured spread
 *   6. the model prediction and the sentiment lane, side by side
 *
 * Space division: hybrid — the page is a capped fluid shell, and band 3 is the
 * one surface that goes wide inside it.
 *
 * Country selection lives in the URL (`?country=KR`) so a finding can be linked
 * to. There is no router in this repo, so it is read and written with
 * `URLSearchParams` + `history.replaceState` directly.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import AttHeadline from '../components/insights/AttHeadline'
import LaneCrossCheck from '../components/insights/LaneCrossCheck'
import PolicyLimitBars from '../components/insights/PolicyLimitBars'
import PolicyMap from '../components/insights/PolicyMap'
import SdidChart from '../components/insights/SdidChart'
import PolicyTrendLines from '../components/insights/PolicyTrendLines'
import CityPredictionCard from '../components/insights/CityPredictionCard'
import NewsSentimentCard from '../components/insights/NewsSentimentCard'
import WfPlaceholder from '../components/wireframe/WfPlaceholder'
import PublicPageContainer from '../components/wireframe/PublicPageContainer'
import { COUNTRY_CENTERS } from '../lib/config/countryCenters'
import {
  useInsightsCatalogue,
  useInsightsDetail,
  type AnalysedCountry,
} from '../hooks/useInsightsData'
import '../styles/obs.css'
import '../styles/insights.css'

const COUNTRY_PARAM = 'country'

function readCountryParam(): string | null {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get(COUNTRY_PARAM)
  return raw && /^[A-Za-z]{2,3}$/.test(raw) ? raw.toUpperCase() : null
}

/**
 * Opening country when the URL names none: the first estimate that survived
 * every honesty gate, so the page opens on something it can actually explain.
 * Falls back to the first analysed country when nothing did.
 */
function defaultCountry(countries: AnalysedCountry[]): AnalysedCountry | null {
  if (countries.length === 0) return null
  return (
    countries.find(
      (c) => c.summary.att !== null && c.summary.significant === true && COUNTRY_CENTERS[c.countryCode],
    ) ??
    countries.find((c) => c.summary.att !== null) ??
    countries[0]
  )
}

export default function Insights() {
  const catalogue = useInsightsCatalogue()
  const [requested, setRequested] = useState<string | null>(readCountryParam)

  const selected = useMemo<AnalysedCountry | null>(() => {
    if (catalogue.countries.length === 0) return null
    const hit = requested
      ? catalogue.countries.find((c) => c.countryCode === requested)
      : undefined
    return hit ?? defaultCountry(catalogue.countries)
  }, [catalogue.countries, requested])

  const detail = useInsightsDetail(selected, catalogue.countries)

  // The URL follows the selection rather than driving it, so an unknown or
  // unanalysed code in the link resolves to the default without a redirect
  // loop — and the address bar then names what is actually on screen.
  useEffect(() => {
    if (!selected || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get(COUNTRY_PARAM) === selected.countryCode) return
    params.set(COUNTRY_PARAM, selected.countryCode)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }, [selected])

  const handleSelect = useCallback((code: string) => {
    setRequested(code.toUpperCase())
  }, [])

  const estimatedCount = useMemo(
    () => catalogue.countries.filter((c) => c.summary.att !== null).length,
    [catalogue.countries],
  )

  const peers = useMemo(
    () =>
      selected?.region
        ? catalogue.countries.filter((c) => c.region === selected.region)
        : catalogue.countries,
    [catalogue.countries, selected],
  )

  const mapAnchor = selected ? COUNTRY_CENTERS[selected.countryCode] : undefined

  if (catalogue.status === 'loading') {
    return (
      <PublicPageContainer tier="hub" className="ins-page obs-surface">
        <div className="ins-shell">
          <WfPlaceholder height={220} label="Loading the analysed country set…" />
        </div>
      </PublicPageContainer>
    )
  }

  // A failed read and a successfully-read empty set are different facts, and
  // the copy has to say which one happened.
  if (catalogue.status === 'error' || !selected) {
    return (
      <PublicPageContainer tier="hub" className="ins-page obs-surface">
        <div className="ins-shell">
          <h1 className="ins-headline-title">Insights</h1>
          <p className="ins-empty">
            {catalogue.status === 'error'
              ? 'The policy-impact result set could not be read. This is a failure to load it, not a statement that no analysis exists — nothing is being substituted in its place.'
              : 'The policy-impact result set loaded, and it is empty: no country has a published SDID estimate right now.'}
          </p>
        </div>
      </PublicPageContainer>
    )
  }

  return (
    <PublicPageContainer tier="hub" className="ins-page obs-surface">
      <div className="ins-shell">
        <nav className="ins-picker" aria-label="Country">
          <label className="m ins-picker-label">
            COUNTRY
            <select
              className="ins-picker-select"
              value={selected.countryCode}
              onChange={(e) => handleSelect(e.target.value)}
            >
              {catalogue.countries.map((c) => (
                <option key={c.countryCode} value={c.countryCode}>
                  {c.flag ? `${c.flag} ` : ''}{c.name}
                  {c.summary.att === null ? ' — not estimated' : ''}
                </option>
              ))}
            </select>
          </label>
          {catalogue.generatedAt ? (
            <span className="m ins-picker-stamp num">ESTIMATED {catalogue.generatedAt}</span>
          ) : null}
        </nav>

        {/* 1 — headline */}
        <AttHeadline
          countryName={selected.name}
          flag={selected.flag}
          summary={selected.summary}
          impact={detail.impact}
          estimatedCount={estimatedCount}
          totalCount={catalogue.countries.length}
        />

        {detail.status === 'error' ? (
          <p className="ins-empty">
            This country's detail feeds could not be read. The verdict above
            comes from the summary and still stands; the charts below are
            missing because the request failed, not because the data is absent.
          </p>
        ) : null}

        {/* 2 — cross-check + national standards */}
        <div className="ins-duo">
          <LaneCrossCheck impact={detail.impact} />
          <PolicyLimitBars countries={peers} selectedCode={selected.countryCode} />
        </div>

        {/* 3 — the map, full width */}
        {detail.status === 'loading' ? (
          <WfPlaceholder height={360} label="Loading the regional panel…" />
        ) : mapAnchor ? (
          <PolicyMap
            // The map owns a `pickedYear`, and a year picked for the previous
            // country is not a year this one observed. Today the remount is
            // already guaranteed by the branch above: switching country changes
            // the detail key, which returns `status: 'loading'` for a frame and
            // swaps in the placeholder, unmounting the map. This `key` is the
            // second lock — it keeps the guarantee if that loading branch is
            // ever removed or made to hold the previous render.
            key={selected.countryCode}
            panels={detail.peerPanels}
            selectedCode={selected.countryCode}
            selectedName={selected.name}
            regionName={selected.region}
            focusYear={detail.impact?.status === 'ok' ? (selected.summary.treatmentYear ?? null) : null}
            peersWithoutAnchor={detail.peersWithoutAnchor}
            peersOmitted={detail.peersOmitted}
            peersUnreadable={detail.peersUnreadable}
          />
        ) : (
          <section className="ins-map-band">
            <h2 className="ins-band-title">Observed PM2.5</h2>
            <p className="ins-empty">
              {selected.name} has no map coordinate in this build, so it cannot
              be placed. The series below is unaffected.
            </p>
          </section>
        )}

        {/* 4 — synthetic control */}
        {detail.status === 'loading' ? (
          <WfPlaceholder height={320} label="Loading the synthetic-control curve…" />
        ) : (
          <SdidChart
            series={detail.impact?.sdid_series}
            treatmentYear={selected.summary.treatmentYear}
          />
        )}

        {/* 5 — observed trend with the measured spread */}
        {detail.status === 'loading' ? (
          <WfPlaceholder height={320} label="Loading the observed series…" />
        ) : (
          <PolicyTrendLines
            panels={detail.panel ? [detail.panel, ...detail.peerPanels.filter((p) => p.countryCode !== selected.countryCode)] : detail.peerPanels}
            selectedCode={selected.countryCode}
          />
        )}

        {/* 6 — model prediction | sentiment lane */}
        <div className="ins-duo">
          <CityPredictionCard lat={mapAnchor?.[0]} lon={mapAnchor?.[1]} />
          <NewsSentimentCard countryName={selected.name} />
        </div>

        <footer className="ins-foot">
          <p className="m">
            SDID ESTIMATES · {estimatedCount} OF {catalogue.countries.length} COUNTRIES
            {catalogue.unnamedCount > 0 ? ` · ${catalogue.unnamedCount} UNNAMED IN THE CATALOGUE` : ''}
          </p>
          <p className="ins-note">
            Every number on this page comes from the published artifacts on the
            live dataset. Countries with no estimate are shown as gated, with the
            reason — the batch ran on all of them and declined on some.
          </p>
        </footer>
      </div>
    </PublicPageContainer>
  )
}
