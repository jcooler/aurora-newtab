import { describe, expect, it, vi } from 'vitest'
import { openMeteoProvider } from './openMeteo'

const payload = {
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
}

describe('openMeteoProvider', () => {
  it('maps the Open-Meteo response to a WeatherSnapshot', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    })
    const snap = await openMeteoProvider(fetchFn as unknown as typeof fetch).fetchSnapshot(
      52.52,
      13.4,
      'Berlin',
    )
    expect(fetchFn.mock.calls[0][0]).toContain('latitude=52.52')
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
    expect(fetchFn.mock.calls[0][0]).toContain('is_day')
    expect(snap.locationLabel).toBe('Berlin')
    expect(snap.fetchedAt).toBeTypeOf('number')
  })

  it('throws a descriptive error on HTTP failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    await expect(
      openMeteoProvider(fetchFn as unknown as typeof fetch).fetchSnapshot(0, 0, 'x'),
    ).rejects.toThrow(/429/)
  })
})
