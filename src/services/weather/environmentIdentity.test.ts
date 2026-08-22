import { describe, expect, it } from 'vitest'
import {
  OPEN_METEO_ENVIRONMENT_REQUEST_CONTRACT,
  POLLEN_SPECIES,
  aqiReading,
  environmentRequestIdentity,
  environmentRequestUrl,
  mapEnvironmentPayload,
  pollenSummary,
  serializeEnvironmentRequestContract,
  unavailableEnvironmentSnapshot,
  uvReading,
} from './environmentIdentity'

describe('Weather environmental request identity', () => {
  it('serializes the exact immutable public contract in provider order', () => {
    const serialized = serializeEnvironmentRequestContract(OPEN_METEO_ENVIRONMENT_REQUEST_CONTRACT)
    expect(serialized).toBe(
      'https://air-quality-api.open-meteo.com/v1/air-quality?timezone=auto&current=us_aqi%2Cuv_index%2Calder_pollen%2Cbirch_pollen%2Cgrass_pollen%2Cmugwort_pollen%2Colive_pollen%2Cragweed_pollen',
    )
    expect(POLLEN_SPECIES).toEqual(['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed'])
  })

  it('normalizes coordinates once, canonicalizes negative zero, and rejects invalid coordinates', () => {
    expect(environmentRequestUrl(40.712776, -74.005974)).toContain('latitude=40.7128&longitude=-74.006')
    expect(environmentRequestUrl(-0, -0)).toContain('latitude=0&longitude=0')
    for (const [lat, lon] of [[Number.NaN, 0], [91, 0], [0, 181]]) {
      expect(() => environmentRequestUrl(lat, lon)).toThrow('Invalid weather coordinates')
    }
  })

  it('uses only the public contract and coordinates in a versioned identity', () => {
    const identity = environmentRequestIdentity(33.749, -84.388)
    expect(identity).toContain('open-meteo-air:v1:https://air-quality-api.open-meteo.com/v1/air-quality?')
    expect(identity).toContain('latitude=33.749')
    expect(identity).toContain('longitude=-84.388')
    expect(identity).not.toContain('Atlanta')
    expect(identity).not.toContain('fetchedAt')
  })

  it('changes serialized identity input whenever the environmental contract changes', () => {
    const changed = serializeEnvironmentRequestContract({
      ...OPEN_METEO_ENVIRONMENT_REQUEST_CONTRACT,
      current: [...OPEN_METEO_ENVIRONMENT_REQUEST_CONTRACT.current, 'pm2_5'],
    })
    expect(changed).not.toBe(serializeEnvironmentRequestContract(OPEN_METEO_ENVIRONMENT_REQUEST_CONTRACT))
  })
})

describe('Weather environmental provider mapping', () => {
  const identity = 'open-meteo-air:v1:public-contract'

  it('maps finite AQI, UV, and pollen in canonical species order', () => {
    const snapshot = mapEnvironmentPayload({
      current: {
        us_aqi: 54.4,
        uv_index: 3.25,
        alder_pollen: 0,
        birch_pollen: 1.5,
        grass_pollen: null,
        mugwort_pollen: 4.25,
        olive_pollen: 0,
        ragweed_pollen: 2,
      },
    }, identity, 123)

    expect(snapshot).toEqual({
      requestIdentity: identity,
      fetchedAt: 123,
      status: 'available',
      usAqi: 54.4,
      uvIndex: 3.25,
      pollen: {
        status: 'available',
        readings: [
          { species: 'alder', grainsPerCubicMeter: 0 },
          { species: 'birch', grainsPerCubicMeter: 1.5 },
          { species: 'mugwort', grainsPerCubicMeter: 4.25 },
          { species: 'olive', grainsPerCubicMeter: 0 },
          { species: 'ragweed', grainsPerCubicMeter: 2 },
        ],
      },
    })
  })

  it('keeps a successful partial response useful and marks all-null pollen unavailable', () => {
    expect(mapEnvironmentPayload({
      current: {
        us_aqi: null,
        uv_index: 1.2,
        alder_pollen: null,
        birch_pollen: null,
        grass_pollen: null,
        mugwort_pollen: null,
        olive_pollen: null,
        ragweed_pollen: null,
      },
    }, identity, 456)).toEqual({
      requestIdentity: identity,
      fetchedAt: 456,
      status: 'available',
      usAqi: null,
      uvIndex: 1.2,
      pollen: { status: 'unavailable' },
    })
  })

  it.each([
    { current: { us_aqi: '54' } },
    { current: { uv_index: Number.NaN } },
    { current: { grass_pollen: -0.1 } },
    { current: { birch_pollen: Number.POSITIVE_INFINITY } },
  ])('rejects malformed finite and non-negative provider values: %#', (payload) => {
    expect(() => mapEnvironmentPayload(payload, identity, 1)).toThrow('Invalid environmental weather payload')
  })

  it('constructs one exact unavailable result for a non-abort provider failure', () => {
    expect(unavailableEnvironmentSnapshot(identity, 789)).toEqual({
      requestIdentity: identity,
      fetchedAt: 789,
      status: 'unavailable',
      usAqi: null,
      uvIndex: null,
      pollen: { status: 'unavailable' },
    })
  })
})

describe('Weather environmental presentation meaning', () => {
  it.each([
    [49.49, 49, 'Good'],
    [50.49, 50, 'Good'],
    [50.5, 51, 'Moderate'],
    [100.49, 100, 'Moderate'],
    [100.5, 101, 'Unhealthy for sensitive groups'],
    [150.5, 151, 'Unhealthy'],
    [200.5, 201, 'Very unhealthy'],
    [300.5, 301, 'Hazardous'],
  ])('rounds AQI %s once so displayed %s and %s category agree', (raw, value, category) => {
    expect(aqiReading(raw)).toEqual({ value, category })
  })

  it.each([
    [2.49, 2, 'Low'],
    [2.5, 3, 'Moderate'],
    [5.5, 6, 'High'],
    [7.5, 8, 'Very high'],
    [10.5, 11, 'Extreme'],
  ])('rounds UV %s once so displayed %s and %s category agree', (raw, value, category) => {
    expect(uvReading(raw)).toEqual({ value, category })
  })

  it('summarizes unavailable, clear, and dominant pollen without guessed severity', () => {
    expect(pollenSummary({ status: 'unavailable' })).toEqual({ kind: 'unavailable' })
    expect(pollenSummary({
      status: 'available',
      readings: [
        { species: 'alder', grainsPerCubicMeter: 0 },
        { species: 'grass', grainsPerCubicMeter: 0 },
      ],
    })).toEqual({ kind: 'clear' })
    expect(pollenSummary({
      status: 'available',
      readings: [
        { species: 'birch', grainsPerCubicMeter: 2 },
        { species: 'grass', grainsPerCubicMeter: 7.5 },
        { species: 'ragweed', grainsPerCubicMeter: 3 },
      ],
    })).toEqual({
      kind: 'reading',
      label: 'Grass',
      grainsPerCubicMeter: 7.5,
    })
  })
})
