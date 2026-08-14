import { describe, expect, it } from 'vitest'
import {
  OPEN_METEO_REQUEST_CONTRACT,
  normalizeWeatherCoordinates,
  serializeWeatherRequestContract,
  weatherRequestIdentity,
  weatherRequestUrl,
} from './identity'

describe('Weather request identity', () => {
  it('normalizes coordinates once and canonicalizes negative zero', () => {
    expect(normalizeWeatherCoordinates(40.712776, -74.005974)).toEqual({
      lat: 40.7128,
      lon: -74.006,
    })
    const zero = normalizeWeatherCoordinates(-0, -0)
    expect(Object.is(zero.lat, -0)).toBe(false)
    expect(Object.is(zero.lon, -0)).toBe(false)
  })

  it.each([
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [91, 0],
    [-91, 0],
    [0, 181],
    [0, -181],
  ])('rejects invalid coordinates before constructing a request (%s, %s)', (lat, lon) => {
    expect(() => normalizeWeatherCoordinates(lat, lon)).toThrow('Invalid weather coordinates')
    expect(() => weatherRequestUrl(lat, lon)).toThrow('Invalid weather coordinates')
  })

  it('separates same-name places by normalized coordinates', () => {
    const dallasTexas = weatherRequestIdentity(32.7767, -96.797)
    const dallasGeorgia = weatherRequestIdentity(34.0232, -84.3616)
    expect(dallasTexas).not.toBe(dallasGeorgia)
    expect(weatherRequestIdentity(32.77674, -96.79704)).toBe(dallasTexas)
  })

  it('serializes every provider input deterministically and changes with the contract', () => {
    const serialized = serializeWeatherRequestContract(OPEN_METEO_REQUEST_CONTRACT)
    expect(serialized).toContain('https://api.open-meteo.com/v1/forecast')
    expect(serialized).toContain('temperature_unit=celsius')
    expect(serialized).toContain('wind_speed_unit=kmh')
    expect(serialized).toContain('forecast_hours=12')
    expect(serialized).toContain('forecast_days=1')
    expect(serialized).toContain('timezone=auto')
    expect(serialized).toContain('timeformat=iso8601')
    expect(serialized).toContain('current=temperature_2m')
    expect(serialized).toContain('hourly=temperature_2m')
    expect(serialized).toContain('daily=sunrise%2Csunset')

    const changed = serializeWeatherRequestContract({
      ...OPEN_METEO_REQUEST_CONTRACT,
      forecastHours: 24,
    })
    expect(changed).not.toBe(serialized)
  })

  it('contains only the public provider contract and normalized coordinates', () => {
    const identity = weatherRequestIdentity(40.712776, -74.005974)
    expect(identity).toContain('open-meteo:v1:')
    expect(identity).toContain('latitude=40.7128')
    expect(identity).toContain('longitude=-74.006')
    expect(identity).not.toContain('New York')
    expect(identity).not.toContain('fetchedAt')
    expect(identity).not.toContain('settings')
  })
})
