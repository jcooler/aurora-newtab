import { describe, expect, it, vi } from 'vitest'
import { environmentRequestIdentity } from './environmentIdentity'
import { ENVIRONMENT_RESPONSE_TIMEOUT_MS, openMeteoProvider } from './openMeteo'

const forecastPayload = {
  current: {
    temperature_2m: 21.4,
    apparent_temperature: 22.1,
    weather_code: 2,
    wind_speed_10m: 14.2,
    relative_humidity_2m: 60,
    is_day: 1,
  },
  hourly: {
    time: ['2026-07-26T13:00', '2026-07-26T14:00'],
    temperature_2m: [21.0, 22.5],
    precipitation_probability: [10, 55],
    weather_code: [2, 61],
    is_day: [1, 0],
  },
  daily: {
    sunrise: ['2026-07-26T05:42'],
    sunset: ['2026-07-26T20:31'],
  },
}

const environmentPayload = {
  current: {
    us_aqi: 54,
    uv_index: 3.2,
    alder_pollen: 0,
    birch_pollen: 1.5,
    grass_pollen: 4,
    mugwort_pollen: 0.2,
    olive_pollen: 0,
    ragweed_pollen: 0,
  },
}

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function routeFetch(forecastBody: unknown = forecastPayload, environmentBody: unknown = environmentPayload) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => (
    String(input).includes('air-quality-api.open-meteo.com')
      ? response(environmentBody)
      : response(forecastBody)
  ))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('openMeteoProvider', () => {
  it('maps forecast and environmental responses under the same normalized coordinates and signal', async () => {
    const controller = new AbortController()
    const fetchFn = routeFetch()
    const snap = await openMeteoProvider(fetchFn as unknown as typeof fetch).fetchSnapshot(
      52.52004,
      13.40004,
      'Berlin',
      { signal: controller.signal },
    )

    expect(fetchFn).toHaveBeenCalledTimes(2)
    const forecastCall = fetchFn.mock.calls.find(([url]) => !String(url).includes('air-quality-api'))!
    const environmentCall = fetchFn.mock.calls.find(([url]) => String(url).includes('air-quality-api'))!
    const [forecastUrl, forecastInit] = forecastCall
    const [environmentUrl, environmentInit] = environmentCall

    expect(forecastUrl).toContain('latitude=52.52')
    expect(forecastUrl).toContain('longitude=13.4')
    expect(forecastUrl).toContain('temperature_unit=celsius')
    expect(forecastUrl).toContain('wind_speed_unit=kmh')
    expect(forecastUrl).toContain('forecast_hours=12')
    expect(forecastUrl).toContain('forecast_days=1')
    expect(forecastUrl).toContain('timezone=auto')
    expect(forecastUrl).toContain('timeformat=iso8601')
    expect(environmentUrl).toContain('latitude=52.52')
    expect(environmentUrl).toContain('longitude=13.4')
    expect(environmentUrl).toContain('current=us_aqi%2Cuv_index%2Calder_pollen')
    expect(forecastInit).toEqual({ signal: controller.signal })
    expect(environmentInit).toEqual({ signal: controller.signal })

    expect(snap.current).toEqual({
      tempC: 21.4,
      feelsLikeC: 22.1,
      code: 2,
      windKmh: 14.2,
      humidity: 60,
      isDay: true,
    })
    expect(snap.hourly).toEqual([
      { time: '2026-07-26T13:00', tempC: 21, precipProb: 10, code: 2, isDay: true },
      { time: '2026-07-26T14:00', tempC: 22.5, precipProb: 55, code: 61, isDay: false },
    ])
    expect(forecastUrl).toContain('is_day')
    expect(forecastUrl).toContain('daily=sunrise%2Csunset')
    expect(snap.locationLabel).toBe('Berlin')
    expect(snap.requestIdentity).toContain('latitude=52.52')
    expect(snap.requestIdentity).toContain('longitude=13.4')
    expect(snap.fetchedAt).toBeTypeOf('number')
    expect(snap.sunriseISO).toBe('2026-07-26T05:42')
    expect(snap.sunsetISO).toBe('2026-07-26T20:31')
    expect(snap.environment).toMatchObject({
      requestIdentity: environmentRequestIdentity(52.52004, 13.40004),
      fetchedAt: snap.fetchedAt,
      status: 'available',
      usAqi: 54,
      uvIndex: 3.2,
      pollen: {
        status: 'available',
        readings: expect.arrayContaining([
          { species: 'grass', grainsPerCubicMeter: 4 },
        ]),
      },
    })
  })

  it('maps a successful all-null pollen response as explicitly unavailable', async () => {
    const fetchFn = routeFetch(forecastPayload, {
      current: {
        us_aqi: 33,
        uv_index: 0,
        alder_pollen: null,
        birch_pollen: null,
        grass_pollen: null,
        mugwort_pollen: null,
        olive_pollen: null,
        ragweed_pollen: null,
      },
    })
    const snap = await openMeteoProvider(fetchFn as unknown as typeof fetch).fetchSnapshot(33.749, -84.388, 'Atlanta')
    expect(snap.environment).toMatchObject({
      status: 'available',
      usAqi: 33,
      uvIndex: 0,
      pollen: { status: 'unavailable' },
    })
  })

  it.each([
    ['HTTP failure', response({}, 503)],
    ['malformed payload', response({ current: { grass_pollen: -1 } })],
  ])('keeps forecast useful when the environmental leg has an %s', async (_name, environmentResponse) => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => (
      String(input).includes('air-quality-api.open-meteo.com')
        ? environmentResponse
        : response(forecastPayload)
    ))
    const before = Date.now()
    const snap = await openMeteoProvider(fetchFn as unknown as typeof fetch).fetchSnapshot(33.749, -84.388, 'Atlanta')
    expect(snap.current.tempC).toBe(21.4)
    expect(snap.environment).toEqual({
      requestIdentity: environmentRequestIdentity(33.749, -84.388),
      fetchedAt: snap.fetchedAt,
      status: 'unavailable',
      usAqi: null,
      uvIndex: null,
      pollen: { status: 'unavailable' },
    })
    expect(snap.fetchedAt).toBeGreaterThanOrEqual(before)
  })

  it('keeps forecast useful when the optional environmental leg never settles', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn = vi.fn((input: string | URL | Request) => (
        String(input).includes('air-quality-api.open-meteo.com')
          ? new Promise<Response>(() => undefined)
          : Promise.resolve(response(forecastPayload))
      ))

      const request = openMeteoProvider(fetchFn as unknown as typeof fetch)
        .fetchSnapshot(33.749, -84.388, 'Atlanta')
      await vi.advanceTimersByTimeAsync(ENVIRONMENT_RESPONSE_TIMEOUT_MS)

      const snap = await request
      expect(snap.current.tempC).toBe(21.4)
      expect(snap.environment).toEqual({
        requestIdentity: environmentRequestIdentity(33.749, -84.388),
        fetchedAt: snap.fetchedAt,
        status: 'unavailable',
        usAqi: null,
        uvIndex: null,
        pollen: { status: 'unavailable' },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves sun times undefined when the daily block is absent', async () => {
    const { daily: _daily, ...payloadWithoutDaily } = forecastPayload
    const fetchFn = routeFetch(payloadWithoutDaily)
    const snap = await openMeteoProvider(fetchFn as unknown as typeof fetch).fetchSnapshot(
      52.52,
      13.4,
      'Berlin',
    )
    expect(snap.sunriseISO).toBeUndefined()
    expect(snap.sunsetISO).toBeUndefined()
  })

  it('throws a descriptive error when the forecast request fails', async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => (
      String(input).includes('air-quality-api.open-meteo.com')
        ? response(environmentPayload)
        : response({}, 429)
    ))
    await expect(
      openMeteoProvider(fetchFn as unknown as typeof fetch).fetchSnapshot(0, 0, 'x'),
    ).rejects.toThrow(/429/)
  })

  it('handles a late environmental rejection after the forecast already failed', async () => {
    const forecastError = new Error('forecast offline')
    const lateEnvironment = deferred<ReturnType<typeof response>>()
    const fetchFn = vi.fn((input: string | URL | Request) => (
      String(input).includes('air-quality-api.open-meteo.com')
        ? lateEnvironment.promise
        : Promise.reject(forecastError)
    ))
    const request = openMeteoProvider(fetchFn as unknown as typeof fetch).fetchSnapshot(1, 2, 'Anywhere')
    await expect(request).rejects.toBe(forecastError)
    lateEnvironment.reject(new Error('late environment failure'))
    await lateEnvironment.promise.catch(() => undefined)
  })

  it('forwards an environmental abort rejection without converting it into a cache result', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('air-quality-api.open-meteo.com')) throw abort
      return response(forecastPayload)
    })
    const controller = new AbortController()
    await expect(
      openMeteoProvider(fetchFn as unknown as typeof fetch).fetchSnapshot(
        1,
        2,
        'Anywhere',
        { signal: controller.signal },
      ),
    ).rejects.toBe(abort)
  })

  it('forwards a forecast abort rejection without converting it into a cache result', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      if (!String(input).includes('air-quality-api.open-meteo.com')) throw abort
      return response(environmentPayload)
    })
    await expect(
      openMeteoProvider(fetchFn as unknown as typeof fetch).fetchSnapshot(1, 2, 'Anywhere'),
    ).rejects.toBe(abort)
  })
})
