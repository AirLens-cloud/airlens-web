/**
 * CountryProfile — /country/:code. Regional Evidence Portrait (Wave D-3).
 *
 * No router in this repo (`App.tsx` — plain pathname branching); this
 * component takes the ISO country code as a prop rather than reading the URL
 * itself, so whichever branch wires up the `/country/:code` path only needs
 * to extract the segment and pass it down.
 *
 * Order (§2/§4 of `country-profile-regional-evidence-portrait.md`): summary
 * → city distribution → source coverage / policy evidence → dataset link.
 * Reversing this — leading with a policy verdict before the observed summary
 * — is the one thing the spec calls a design violation, so it is preserved
 * here even though this page has no shell to enforce it structurally yet.
 *
 * `fetchCountrySeries` already distinguishes "this country has no published
 * panel" (404 → null) from "the panel could not be read" (5xx → throw) —
 * this page renders those as different states rather than collapsing both
 * into one empty screen, per the spec's non-negotiable principle.
 */
import { useEffect, useState } from 'react'
import { fetchCountrySeries } from '../api/countrySeries'
import {
  fetchCountryPolicyImpact,
  fetchPolicyIndex,
  attGateReason,
  attReliability,
} from '../api/policy'
import { loadCityCatalog, type WeatherCity } from '../lib/cityCatalog'
import { WHO_PM25_ANNUAL_GUIDELINE } from '../lib/config/countryCenters'
import type { CountryPanel } from '../types/policy'
import type { PolicyIndexEntry, PolicyImpact } from '../types/policy'
import WfPlaceholder from '../components/wireframe/WfPlaceholder'
import '../styles/catalog.css'

export interface CountryProfileProps {
  code: string
}

type PageStatus = 'loading' | 'ready' | 'no-coverage' | 'unavailable'

interface PolicySection {
  status: 'ready' | 'no-estimate' | 'error'
  impact: PolicyImpact | null
}

/**
 * `ready` with zero cities ("this country has no catalogued cities") and
 * `error` ("the city catalogue could not be read") are different facts and
 * must render differently — collapsing a `loadCityCatalog()` rejection into
 * an empty array would present a network failure as an honest "no cities"
 * verdict, which is the one thing this page exists to avoid (see the
 * `policy` section's identical rejected/no-estimate split just below).
 */
interface CitiesSection {
  status: 'ready' | 'error'
  cities: WeatherCity[]
}

interface ProfileState {
  status: PageStatus
  panel: CountryPanel | null
  indexEntry: PolicyIndexEntry | null
  citiesSection: CitiesSection
  policy: PolicySection
}

const INITIAL: ProfileState = {
  status: 'loading',
  panel: null,
  indexEntry: null,
  citiesSection: { status: 'ready', cities: [] },
  policy: { status: 'ready', impact: null },
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

const RELIABILITY_COPY: Record<string, string> = {
  reliable: 'Distinguishable from zero — read alongside its confidence interval.',
  insignificant: 'A difference was not confirmed — the interval includes "no effect".',
  unstable: 'The synthetic control diverged before treatment; this estimate is not trustworthy.',
  no_data: 'No estimate was produced.',
}

export default function CountryProfile({ code }: CountryProfileProps) {
  const cc = normalizeCode(code)
  // Keyed by the code it answers, the same pattern `useInsightsDetail` uses —
  // so a result settling for a previous code is never shown under a new
  // one's heading, and switching code returns to "loading" by derivation
  // (below) rather than by an extra synchronous setState at the top of the
  // effect (which retriggers a render on every code change for no reason).
  const [settled, setSettled] = useState<{ code: string; state: ProfileState } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      let panel: CountryPanel | null
      try {
        panel = await fetchCountrySeries(cc)
      } catch {
        if (!cancelled) setSettled({ code: cc, state: { ...INITIAL, status: 'unavailable' } })
        return
      }
      if (cancelled) return
      if (panel === null) {
        setSettled({ code: cc, state: { ...INITIAL, status: 'no-coverage' } })
        return
      }

      const [indexResult, citiesResult, impactResult] = await Promise.allSettled([
        fetchPolicyIndex(),
        loadCityCatalog(),
        fetchCountryPolicyImpact(cc),
      ])
      if (cancelled) return

      const index = indexResult.status === 'fulfilled' ? indexResult.value : []
      const indexEntry = index.find((e) => e.countryCode.toUpperCase() === cc) ?? null

      const citiesSection: CitiesSection =
        citiesResult.status === 'fulfilled'
          ? { status: 'ready', cities: citiesResult.value.filter((c) => c.countryCode.toUpperCase() === cc) }
          : { status: 'error', cities: [] }

      let policy: PolicySection
      if (impactResult.status === 'rejected') {
        policy = { status: 'error', impact: null }
      } else if (impactResult.value === null) {
        policy = { status: 'no-estimate', impact: null }
      } else {
        policy = { status: 'ready', impact: impactResult.value }
      }

      setSettled({ code: cc, state: { status: 'ready', panel, indexEntry, citiesSection, policy } })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [cc])

  const state = settled?.code === cc ? settled.state : INITIAL

  if (state.status === 'loading') {
    return (
      <main className="cat-page">
        <div className="cat-shell">
          <WfPlaceholder height={220} label={`Loading ${cc}…`} />
        </div>
      </main>
    )
  }

  if (state.status === 'unavailable') {
    return (
      <main className="cat-page">
        <div className="cat-shell">
          <h1 className="cat-title">{cc}</h1>
          <p className="cat-error">
            This country's panel could not be read. This is a failure to read it, not a
            statement that {cc} has no reference observations.
          </p>
        </div>
      </main>
    )
  }

  if (state.status === 'no-coverage') {
    return (
      <main className="cat-page">
        <div className="cat-shell">
          <h1 className="cat-title">{cc}</h1>
          <p className="cat-empty" data-testid="country-no-coverage">
            This country has no reference observations published.
          </p>
        </div>
      </main>
    )
  }

  const { panel, indexEntry, citiesSection, policy } = state
  const latest = panel!.points[panel!.points.length - 1]
  const legalStandard = indexEntry?.pm25AnnualStandard ?? null
  const maxBar = Math.max(latest.pm25, legalStandard ?? 0, WHO_PM25_ANNUAL_GUIDELINE)

  return (
    <main className="cat-page">
      <div className="cat-shell">
        {/* ① country summary */}
        <header className="cat-header">
          <div>
            <h1 className="cat-title">
              {indexEntry?.flag ? <span aria-hidden="true">{indexEntry.flag} </span> : null}
              {indexEntry?.country ?? panel!.countryName ?? cc}
            </h1>
            <p className="cat-subtitle">
              PM2.5 annual mean, {latest.year} · <span className="cat-nature-badge">observation</span>
            </p>
          </div>
          <span className="cat-value num">{latest.pm25.toFixed(1)} µg/m³</span>
        </header>

        <div className="cat-bars" role="img" aria-label={`${cc} annual mean vs WHO guideline and national standard`}>
          <BarRow label={`${cc} mean`} value={latest.pm25} max={maxBar} active />
          <BarRow label="WHO guideline" value={WHO_PM25_ANNUAL_GUIDELINE} max={maxBar} />
          {legalStandard !== null ? <BarRow label="National standard" value={legalStandard} max={maxBar} /> : null}
        </div>
        {legalStandard === null ? (
          <p className="cat-note">No national annual PM2.5 standard is published for {cc} in the catalogue.</p>
        ) : null}

        {/* ② city distribution */}
        <section aria-labelledby="cat-cities-title">
          <h2 id="cat-cities-title" className="cat-band-title">City distribution</h2>
          {citiesSection.status === 'error' ? (
            <p className="cat-note" data-testid="country-cities-error">
              The city catalogue could not be read. This is a failure to read it, not a
              statement that {cc} has no catalogued cities.
            </p>
          ) : citiesSection.cities.length === 0 ? (
            <p className="cat-empty" data-testid="country-no-cities">
              This country has no catalogued cities with reference observations.
            </p>
          ) : (
            <>
              <ul className="cat-city-list" data-testid="country-city-list">
                {citiesSection.cities.map((c) => (
                  <li key={`${c.name}-${c.lat}-${c.lon}`} className="cat-city-item">
                    {c.name}
                  </li>
                ))}
              </ul>
              <p className="cat-note">
                This list is drawn from a 50-city global catalogue and shows only the
                {citiesSection.cities.length === 1 ? ' one city' : ` ${citiesSection.cities.length} cities`} in it
                that belong to {cc} — it does not represent every city in this country.
              </p>
            </>
          )}
        </section>

        {/* ③ source coverage / ④ policy evidence */}
        <div className="cat-duo">
          <section aria-labelledby="cat-sources-title">
            <h2 id="cat-sources-title" className="cat-band-title">Source coverage</h2>
            <div className="cat-chip-row">
              {panel!.sourcesUsed.length > 0 ? (
                panel!.sourcesUsed.map((s) => (
                  <span key={s} className="cat-chip">{s}</span>
                ))
              ) : (
                <span className="cat-chip cat-chip--muted">not published</span>
              )}
            </div>
            <p className="cat-note num">
              {panel!.totalStations ?? '—'} stations · {panel!.points[0]?.year}–{latest.year}
            </p>
          </section>

          <section aria-labelledby="cat-policy-title">
            <h2 id="cat-policy-title" className="cat-band-title">Policy evidence</h2>
            {policy.status === 'error' ? (
              <p className="cat-note">This country's policy evidence could not be read.</p>
            ) : policy.status === 'no-estimate' ? (
              <p className="cat-note">No policy impact estimate has been run for {cc}.</p>
            ) : (
              <PolicyEvidence impact={policy.impact!} />
            )}
            <a className="cat-link" href={`/insights?country=${cc}`}>
              Full analysis → /insights
            </a>
          </section>
        </div>

        {/* ⑤ dataset snapshot */}
        <p className="cat-note">
          <a className="cat-link" href="/datasets">
            The source product for this country's data → /datasets
          </a>
        </p>
      </div>
    </main>
  )
}

function BarRow({ label, value, max, active }: { label: string; value: number; max: number; active?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="cat-bar-row">
      <span className="cat-bar-label m">{label}</span>
      <div className="cat-bar-track">
        <div className={`cat-bar-fill${active ? ' cat-bar-fill--active' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="cat-bar-value num">{value.toFixed(1)}</span>
    </div>
  )
}

function PolicyEvidence({ impact }: { impact: PolicyImpact }) {
  const reliability = attReliability(impact)
  if (impact.att === null) {
    return <p className="cat-note">{attGateReason(impact.status)}</p>
  }
  return (
    <div className="cat-policy-evidence">
      <p className="cat-value num">
        ATT {impact.att.toFixed(1)} µg/m³{' '}
        {impact.ci_low !== null && impact.ci_high !== null
          ? `(95% CI ${impact.ci_low.toFixed(1)} to ${impact.ci_high.toFixed(1)})`
          : ''}
      </p>
      <p className="cat-note">{RELIABILITY_COPY[reliability]}</p>
    </div>
  )
}
