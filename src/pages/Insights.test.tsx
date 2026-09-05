/**
 * Insights page — band order, selection, and the URL contract (AAA).
 *
 * The heavy bands (the WebGL-less canvas map, the prediction card's own feed)
 * are stubbed: they have their own coverage, and jsdom cannot draw either. What
 * is tested here is the page's own decisions — which country it opens on, that
 * the URL follows the selection, and that a catalogue failure is reported as a
 * failure rather than as an empty result set.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import type { PolicyImpact, PolicyIndexEntry, PolicySummary } from '../types/policy'

/**
 * The map stub records MOUNTS, not renders — `useEffect(..., [])` fires once per
 * instance. That is the only way to see the `key` prop doing its job: without
 * it React reuses the instance across a country switch and the real map's
 * `pickedYear` survives into a country that may never have observed that year.
 */
const stub = vi.hoisted(() => ({ mapMounts: [] as string[] }))
vi.mock('../components/insights/PolicyMap', async () => {
  const { useEffect } = await vi.importActual<typeof import('react')>('react')
  function PolicyMapStub({
    selectedCode,
    peersUnreadable,
  }: {
    selectedCode: string
    peersUnreadable: number
  }) {
    // Empty deps on purpose: this must fire once per INSTANCE, not per change
    // of selectedCode — that is the whole signal being recorded.
    useEffect(() => {
      stub.mapMounts.push(selectedCode)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
      <div
        data-testid="band-map"
        data-country={selectedCode}
        data-unreadable={String(peersUnreadable)}
      />
    )
  }
  return { default: PolicyMapStub }
})
vi.mock('../components/insights/CityPredictionCard', () => ({
  default: () => <div data-testid="band-prediction" />,
}))
// Stubbed for the same reason as PolicyMap/CityPredictionCard above: it has
// its own feed and its own coverage (`ForecastBandCard.test.tsx`), and its
// honest "could not be read" text would otherwise collide with this file's
// own failure-state assertions below (both fetch the same globally-stubbed
// `fetch`, and this file's country feed is deliberately incomplete in most
// of these tests).
vi.mock('../components/insights/ForecastBandCard', () => ({
  default: () => <div data-testid="band-forecast" />,
}))

const summaryRow = (countryCode: string, att: number | null, significant: boolean | null) => ({
  countryCode,
  att,
  ci_low: att === null ? null : att - 1,
  ci_high: att === null ? null : att + 0.5,
  p_value: att === null ? null : 0.02,
  significant,
  status: att === null ? 'insufficient_controls' : 'ok',
  treatmentYear: 2018,
  panelSource: 'acag_v6_ground_cal',
  fitScore: 84,
  hasCrossCheck: true,
})

const SUMMARY: PolicySummary = {
  generatedAt: '2026-08-26',
  count: 3,
  countries: [
    summaryRow('AE', null, false),
    summaryRow('KR', -1.87, true),
    summaryRow('JP', -0.4, false),
  ],
}

const INDEX: PolicyIndexEntry[] = [
  { country: 'United Arab Emirates', countryCode: 'AE', region: 'Middle East', flag: '🇦🇪', policyCount: 1, lastUpdated: '2026-08-26' },
  { country: 'South Korea', countryCode: 'KR', region: 'East Asia', flag: '🇰🇷', policyCount: 1, lastUpdated: '2026-08-26', pm25AnnualStandard: 15 },
  { country: 'Japan', countryCode: 'JP', region: 'East Asia', flag: '🇯🇵', policyCount: 1, lastUpdated: '2026-08-26', pm25AnnualStandard: 15 },
]

const IMPACT: Partial<PolicyImpact> & Record<string, unknown> = {
  country: 'KR',
  method: 'sdid',
  panel_source: 'acag_v6_ground_cal',
  att: -1.87,
  ci_95: [-3.46, -0.28],
  p_value: 0.021,
  significant: true,
  status: 'ok',
  treatment_year: 2018,
  synthetic_control: [
    { date: '2016', event: 'Fine Dust Act', pm25: 26, synthetic_pm25: 26 },
    { date: '2019', event: '', pm25: 21, synthetic_pm25: 23.5 },
  ],
  data_quality: { dqss_score: 84 },
  cross_check: { cams_eac4: { att: -0.9, status: 'ok', p_value: 0.3 } },
}

const PANEL = {
  country: 'KR',
  series: [
    { year: 2016, pm25Mean: 26, p10: 14, p90: 40, stationCount: 20, sources: ['acag_v6'] },
    { year: 2019, pm25Mean: 21, p10: 11, p90: 35, stationCount: 21, sources: ['openaq'] },
  ],
  sourcesUsed: ['acag_v6', 'openaq'],
  totalStations: 32,
  policy: { treatment_year: 2018, policy_name: 'Fine Dust Act' },
  generatedAt: '2026-08-26T00:00:00Z',
}

/** Serve the listed URL fragments; everything else 404s. */
function mockFetch(available: Record<string, unknown>) {
  const spy = vi.fn(async (url: string) => {
    const hit = Object.entries(available).find(([path]) => url.includes(path))
    if (!hit) return { ok: false, status: 404 } as Response
    return { ok: true, status: 200, json: async () => hit[1] } as unknown as Response
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

/**
 * Like `mockFetch`, but any URL matching `slowPaths` parks until `release()` is
 * called — the shape of a reader clicking through countries faster than the
 * network answers.
 */
function deferredFetch(available: Record<string, unknown>, slowPaths: string[]) {
  const gates: Array<() => void> = []
  const spy = vi.fn(async (url: string) => {
    const hit = Object.entries(available).find(([path]) => url.includes(path))
    if (!hit) return { ok: false, status: 404 } as Response
    if (slowPaths.some((p) => url.includes(p))) {
      await new Promise<void>((resolve) => gates.push(resolve))
    }
    return { ok: true, status: 200, json: async () => hit[1] } as unknown as Response
  })
  vi.stubGlobal('fetch', spy)
  return { spy, release: () => { gates.splice(0).forEach((g) => g()) } }
}

/** The TREATMENT readout — the one headline field that differs per country here. */
function treatmentText(): string | undefined {
  return document.querySelectorAll('.ins-headline-stats dd')[2]?.textContent ?? undefined
}

const FULL_FEED = {
  'policy-impact/summary.json': SUMMARY,
  'policy-impact/index.json': INDEX,
  'policy-impact/KR.json': IMPACT,
  'policy-impact/JP.json': { ...IMPACT, country: 'JP', att: -0.4 },
  'by_country/KR.json': PANEL,
  'by_country/JP.json': { ...PANEL, country: 'JP' },
}

async function renderPage(path = '/insights') {
  window.history.pushState({}, '', path)
  const { resetPolicyIndexCache } = await import('../api/policy')
  resetPolicyIndexCache()
  const { default: Insights } = await import('./Insights')
  return render(<Insights />)
}

/**
 * Picks a country through the combobox: typing its ISO code narrows the
 * filtered list to exactly that one row (the code is unambiguous even when
 * the country name is not a substring of the query), then clicks it.
 */
function pickCountry(code: string): void {
  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: code } })
  fireEvent.click(screen.getByRole('option'))
}

beforeEach(() => {
  vi.unstubAllGlobals()
  stub.mapMounts.length = 0
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Insights — country selection', () => {
  it('opens on the first country with a significant estimate, not the first alphabetically', async () => {
    // Arrange — AE sorts first but was never estimated.
    mockFetch(FULL_FEED)
    // Act
    await renderPage()
    // Assert
    await waitFor(() => expect(screen.getByTestId('band-map').getAttribute('data-country')).toBe('KR'))
  })

  it('honours a country named in the URL', async () => {
    mockFetch(FULL_FEED)
    await renderPage('/insights?country=JP')
    await waitFor(() => expect(screen.getByTestId('band-map').getAttribute('data-country')).toBe('JP'))
  })

  it('falls back to the default for an unknown code instead of erroring', async () => {
    // Arrange — 'ZZ' is not in the estimated set.
    mockFetch(FULL_FEED)
    // Act
    await renderPage('/insights?country=ZZ')
    // Assert
    await waitFor(() => expect(screen.getByTestId('band-map').getAttribute('data-country')).toBe('KR'))
  })

  it('writes the resolved country back to the URL', async () => {
    mockFetch(FULL_FEED)
    await renderPage('/insights?country=ZZ')
    await waitFor(() => expect(window.location.search).toContain('country=KR'))
  })

  it('lists unestimated countries in the picker, marked as such', async () => {
    // Arrange — hiding them would misrepresent the batch's coverage.
    mockFetch(FULL_FEED)
    await renderPage()
    await waitFor(() => screen.getByRole('combobox'))
    // Act — the row list is a popup; open it before reading its content.
    fireEvent.focus(screen.getByRole('combobox'))
    // Assert
    await waitFor(() =>
      expect(screen.getByText(/United Arab Emirates — not estimated/)).toBeTruthy(),
    )
  })
})

describe('Insights — band order', () => {
  it('renders the six bands in the approved order', async () => {
    // Arrange
    mockFetch(FULL_FEED)
    // Act
    const { container } = await renderPage()
    // Assert
    await waitFor(() => expect(screen.getByTestId('band-map')).toBeTruthy())
    const order = [...container.querySelectorAll('.ins-headline, .ins-lanes, [data-testid="band-map"], .ins-sdid, .ins-trend, [data-testid="band-prediction"]')]
      .map((n) => n.className || n.getAttribute('data-testid'))
    expect(order).toEqual([
      'ins-headline',
      'ins-lanes',
      'band-map',
      'ins-sdid',
      'ins-trend',
      'band-prediction',
    ])
  })

  it('keeps the sentiment slot visible as not published rather than dropping it', async () => {
    mockFetch(FULL_FEED)
    await renderPage()
    await waitFor(() => expect(screen.getByText('NOT PUBLISHED')).toBeTruthy())
  })
})

describe('Insights — failure states', () => {
  it('reports a catalogue failure as a failure, not as an empty result set', async () => {
    // Arrange — nothing serves.
    mockFetch({})
    // Act
    await renderPage()
    // Assert
    await waitFor(() =>
      expect(screen.getByText(/not a statement that no analysis exists/i)).toBeTruthy(),
    )
  })

  it('distinguishes a catalogue that loaded empty from one that failed to load', async () => {
    // Arrange — the request succeeded and the batch estimated nothing.
    mockFetch({
      'policy-impact/summary.json': { generatedAt: null, count: 0, countries: [] },
      'policy-impact/index.json': [],
    })
    // Act
    await renderPage()
    // Assert — "we could not read it" would be a different, false claim.
    await waitFor(() => expect(screen.getByText(/loaded, and it is empty/i)).toBeTruthy())
  })

  it('keeps the summary verdict when the per-country files are absent', async () => {
    // Arrange — catalogue loads, per-country files 404.
    mockFetch({ 'policy-impact/summary.json': SUMMARY, 'policy-impact/index.json': INDEX })
    // Act
    await renderPage()
    // Assert — the estimate rides on the catalogue, so a thin page is not an
    // unanalysed country.
    await waitFor(() =>
      expect(document.getElementById('ins-headline-title')?.textContent).toContain('South Korea'),
    )
    expect(document.querySelector('.ins-headline-att')?.textContent).toBe('-1.87')
    expect(document.querySelector('.ins-headline-gate')).toBeNull()
  })

  it('says the detail feeds could not be read, without disowning the estimate', async () => {
    // Arrange — catalogue serves; every per-country request 503s.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('summary.json')) {
        return { ok: true, status: 200, json: async () => SUMMARY } as unknown as Response
      }
      if (url.includes('policy-impact/index.json')) {
        return { ok: true, status: 200, json: async () => INDEX } as unknown as Response
      }
      return { ok: false, status: 503 } as Response
    }))
    // Act
    await renderPage()
    // Assert — an outage is named as one, and the number above it still stands.
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy())
    expect(document.querySelector('.ins-headline-att')?.textContent).toBe('-1.87')
  })
})

describe('Insights — a peer that could not be read', () => {
  it('counts it apart from peers that published nothing', async () => {
    // Arrange — JP's panel 503s; everything else serves.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('by_country/JP.json')) return { ok: false, status: 503 } as Response
      const hit = Object.entries(FULL_FEED).find(([path]) => url.includes(path))
      if (!hit) return { ok: false, status: 404 } as Response
      return { ok: true, status: 200, json: async () => hit[1] } as unknown as Response
    }))
    // Act
    await renderPage()
    // Assert — a failed neighbour must not shrink the map silently; it is a
    // different fact from a neighbour with no published panel.
    await waitFor(() =>
      expect(screen.getByTestId('band-map').getAttribute('data-unreadable')).toBe('1'),
    )
    expect(screen.getByTestId('band-map').getAttribute('data-country')).toBe('KR')
  })

  it('reports zero unreadable peers when every peer answers', async () => {
    mockFetch(FULL_FEED)
    await renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('band-map').getAttribute('data-unreadable')).toBe('0'),
    )
  })
})

describe('Insights — the map on a country switch', () => {
  /**
   * This pins the PROPERTY — the map instance never spans two countries, so its
   * `pickedYear` cannot outlive the country it was picked for — not the
   * mechanism. Two mechanisms currently enforce it: the detail key returns
   * `status: 'loading'` for a frame (swapping in the placeholder), and the
   * `key` prop on `<PolicyMap>`. Removing either alone still passes; that is
   * why the assertion is on mounts rather than on the prop.
   */
  it('never carries one map instance across two countries', async () => {
    // Arrange
    mockFetch(FULL_FEED)
    await renderPage()
    await waitFor(() => expect(stub.mapMounts).toEqual(['KR']))
    // Act
    pickCountry('JP')
    // Assert — a fresh mount for JP, not the KR instance re-rendered.
    await waitFor(() => expect(stub.mapMounts).toEqual(['KR', 'JP']))
  })

  it('takes the map off screen while the new country is in flight', async () => {
    // Arrange — this is the mechanism the property above currently rests on, so
    // it is worth asserting directly rather than inferring.
    mockFetch(FULL_FEED)
    await renderPage()
    await waitFor(() => expect(screen.getByTestId('band-map')).toBeTruthy())
    // Act
    pickCountry('JP')
    // Assert
    expect(screen.queryByTestId('band-map')).toBeNull()
    await waitFor(() =>
      expect(screen.getByTestId('band-map').getAttribute('data-country')).toBe('JP'),
    )
  })
})

describe('Insights — switching country faster than the network answers', () => {
  it('does not let the country the reader left overwrite the one they returned to', async () => {
    // Arrange — JP's impact file never answers until released.
    const { spy, release } = deferredFetch(
      {
        ...FULL_FEED,
        'policy-impact/JP.json': {
          ...IMPACT,
          country: 'JP',
          att: -0.4,
          synthetic_control: [
            { date: '2016', event: 'Clean Air Program', pm25: 12, synthetic_pm25: 12 },
            { date: '2019', event: '', pm25: 10, synthetic_pm25: 11 },
          ],
        },
      },
      ['policy-impact/JP.json'],
    )
    await renderPage()
    await waitFor(() => expect(treatmentText()).toBe('Fine Dust Act'))

    // Act — away to JP while it hangs, then straight back to KR, then JP lands.
    pickCountry('JP')
    pickCountry('KR')
    // The in-flight request has to be real, or this test asserts nothing.
    expect(spy.mock.calls.some(([u]) => String(u).includes('policy-impact/JP.json'))).toBe(true)
    release()

    // Assert — the late JP payload is keyed to a request nobody is looking at.
    await waitFor(() =>
      expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('South Korea'),
    )
    expect(treatmentText()).toBe('Fine Dust Act')
    expect(document.getElementById('ins-headline-title')?.textContent).toContain('South Korea')
  })
})
