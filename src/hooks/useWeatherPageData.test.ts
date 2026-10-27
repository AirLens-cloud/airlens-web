// useWeatherPageData — the stale-response guard (AAA).
//
// The hook fires three requests per location and applies their results
// together once they settle. A quick city switch, or a manual retry, leaves an
// older request in flight; when it lands after a newer one was issued — or
// after the newer one already landed — it has to be dropped, or the page shows
// one city's reading under another city's name.
//
// The page tests (`Today.test.tsx`, `singleReading.integration.test.tsx`) only
// reach this hook through `vi.mock('../hooks/useWeatherPageData')`, which
// replaces the thing under test. These tests drive the real hook instead, with
// requests the test settles by hand in the order that exposes the race.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWeatherPageData } from './useWeatherPageData'
import { WindField } from '../lib/windField'
import type { WeatherGridMslp } from '../api/weatherProxy'
import type { OpenMeteoWeatherHourly } from '../types/forecast'

vi.mock('../api/weatherProxy', () => ({
  fetchWeatherHourly: vi.fn(),
  fetchWeatherGridMslp: vi.fn(),
}))
vi.mock('../api/weather', () => ({
  fetchWindField: vi.fn(),
}))

import { fetchWeatherHourly, fetchWeatherGridMslp } from '../api/weatherProxy'
import { fetchWindField } from '../api/weather'

beforeEach(() => {
  // Only the clock is faked, so `fetchedAt` says which landing wrote it while
  // timers (and testing-library's polling) stay real.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_000)
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

interface Coords {
  lat: number | null
  lon: number | null
}
const SEOUL: Coords = { lat: 37.57, lon: 126.98 }
const BUSAN: Coords = { lat: 35.18, lon: 129.08 }
const NOWHERE: Coords = { lat: null, lon: null }

function renderWeather(initial: Coords) {
  return renderHook(({ lat, lon }: Coords) => useWeatherPageData(lat, lon), { initialProps: initial })
}

interface Payload {
  weather: OpenMeteoWeatherHourly | null
  wind: WindField | null
  mslp: WeatherGridMslp | null
}

/** One place's full set of results — a fresh object per call, so `toBe` can
 * tell one place's data from another's. */
function payload(tempC: number, mslpHpa: number): Payload {
  return {
    weather: { time: ['2026-10-27T00:00'], temperature_2m: [tempC] },
    wind: new WindField({
      u: new Float32Array(1),
      v: new Float32Array(1),
      nLat: 1,
      nLon: 1,
      latMin: 0,
      lonMin: 0,
      dLat: 1,
      dLon: 1,
    }),
    mslp: { mslp: mslpHpa, refTime: null },
  }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** The three requests one effect run makes, each settled by hand. */
interface Run {
  weather: Deferred<OpenMeteoWeatherHourly | null>
  wind: Deferred<WindField | null>
  mslp: Deferred<WeatherGridMslp | null>
}

/** Queue the requests the hook's NEXT effect run will make — call it before
 * the render / rerender / retry that triggers that run. */
function queueRun(): Run {
  const run: Run = {
    weather: deferred<OpenMeteoWeatherHourly | null>(),
    wind: deferred<WindField | null>(),
    mslp: deferred<WeatherGridMslp | null>(),
  }
  vi.mocked(fetchWeatherHourly).mockImplementationOnce(() => run.weather.promise)
  vi.mocked(fetchWindField).mockImplementationOnce(() => run.wind.promise)
  vi.mocked(fetchWeatherGridMslp).mockImplementationOnce(() => run.mslp.promise)
  return run
}

/** Settle all three of a run's requests with `data`. Call inside `act`. */
function land(run: Run, data: Payload): void {
  run.weather.resolve(data.weather)
  run.wind.resolve(data.wind)
  run.mslp.resolve(data.mslp)
}

describe('useWeatherPageData — a landing request', () => {
  it('applies all three sources together once the requests settle', async () => {
    // Arrange
    const seoul = queueRun()
    const seoulData = payload(12, 1013)
    const { result } = renderWeather(SEOUL)
    expect(result.current.status).toBe('loading')
    // Act
    vi.setSystemTime(2_000)
    await act(async () => {
      land(seoul, seoulData)
    })
    // Assert
    expect(result.current.status).toBe('ready')
    expect(result.current.weather).toBe(seoulData.weather)
    expect(result.current.wind).toBe(seoulData.wind)
    expect(result.current.mslp).toBe(seoulData.mslp)
    expect(result.current.fetchedAt).toBe(2_000)
  })
})

describe('useWeatherPageData — a superseded request', () => {
  it('is dropped when it lands after the newer city has already landed', async () => {
    // Arrange — Seoul is requested, the visitor switches to Busan, Busan lands first.
    const seoul = queueRun()
    const { result, rerender } = renderWeather(SEOUL)
    const busan = queueRun()
    rerender(BUSAN)
    const busanData = payload(18, 1002)
    vi.setSystemTime(2_000)
    await act(async () => {
      land(busan, busanData)
    })
    expect(result.current.weather).toBe(busanData.weather)
    // Act — Seoul's slower request finally lands.
    vi.setSystemTime(3_000)
    await act(async () => {
      land(seoul, payload(12, 1013))
    })
    // Assert — Busan's reading is untouched, including when it landed.
    expect(result.current.status).toBe('ready')
    expect(result.current.weather).toBe(busanData.weather)
    expect(result.current.wind).toBe(busanData.wind)
    expect(result.current.mslp).toBe(busanData.mslp)
    expect(result.current.fetchedAt).toBe(2_000)
  })

  it('cannot end the newer city\'s loading state or put its data on screen', async () => {
    // Arrange — Seoul → Busan, and Busan is still pending.
    const seoul = queueRun()
    const { result, rerender } = renderWeather(SEOUL)
    const busan = queueRun()
    rerender(BUSAN)
    // Act — Seoul answers while the page is waiting for Busan.
    await act(async () => {
      land(seoul, payload(12, 1013))
    })
    // Assert — still loading, nothing from Seoul shown under Busan's coordinates.
    expect(result.current.status).toBe('loading')
    expect(result.current.weather).toBeNull()
    expect(result.current.wind).toBeNull()
    expect(result.current.mslp).toBeNull()
    expect(result.current.fetchedAt).toBeNull()
    // Busan then lands normally — the dropped response did not wedge the hook.
    const busanData = payload(18, 1002)
    await act(async () => {
      land(busan, busanData)
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.weather).toBe(busanData.weather)
  })

  it('cannot blank the newer city\'s data when it fails late', async () => {
    // Arrange — Busan has landed; Seoul's requests are still out.
    const seoul = queueRun()
    const { result, rerender } = renderWeather(SEOUL)
    const busan = queueRun()
    rerender(BUSAN)
    const busanData = payload(18, 1002)
    await act(async () => {
      land(busan, busanData)
    })
    // Act — Seoul's requests fail late. A failed source degrades to `null`, and
    // an unguarded landing would write that null over Busan's data.
    await act(async () => {
      seoul.weather.reject(new Error('timeout'))
      seoul.wind.resolve(null)
      seoul.mslp.resolve(null)
    })
    // Assert
    expect(result.current.weather).toBe(busanData.weather)
    expect(result.current.wind).toBe(busanData.wind)
    expect(result.current.mslp).toBe(busanData.mslp)
  })

  it('is dropped when retry() issued a newer request for the same city', async () => {
    // Arrange — the first Seoul attempt hangs, the visitor presses retry.
    const first = queueRun()
    const { result } = renderWeather(SEOUL)
    const second = queueRun()
    act(() => {
      result.current.retry()
    })
    const retried = payload(14, 1010)
    vi.setSystemTime(2_000)
    await act(async () => {
      land(second, retried)
    })
    expect(result.current.weather).toBe(retried.weather)
    // Act — the abandoned first attempt lands late.
    vi.setSystemTime(3_000)
    await act(async () => {
      land(first, payload(12, 1013))
    })
    // Assert
    expect(fetchWeatherHourly).toHaveBeenCalledTimes(2)
    expect(result.current.weather).toBe(retried.weather)
    expect(result.current.fetchedAt).toBe(2_000)
  })

  it('is dropped when the location went away while it was in flight', async () => {
    // Arrange — coordinates drop back to null (location not resolved) mid-request.
    const seoul = queueRun()
    const { result, rerender } = renderWeather(SEOUL)
    rerender(NOWHERE)
    // Act
    await act(async () => {
      land(seoul, payload(12, 1013))
    })
    // Assert — no reading for a place the page no longer has, and no new fetch.
    expect(result.current.status).toBe('loading')
    expect(result.current.weather).toBeNull()
    expect(result.current.fetchedAt).toBeNull()
    expect(fetchWeatherHourly).toHaveBeenCalledTimes(1)
  })
})
