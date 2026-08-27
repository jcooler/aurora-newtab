import type {
  PollenReading,
  PollenSpecies,
  WeatherEnvironmentSnapshot,
  WeatherPollenSnapshot,
} from '../../lib/storage/schema'
import { normalizeWeatherCoordinates } from './identity'

export interface EnvironmentRequestContract {
  readonly origin: string
  readonly path: string
  readonly timezone: 'auto'
  readonly current: readonly string[]
}

export const POLLEN_SPECIES = Object.freeze([
  'alder',
  'birch',
  'grass',
  'mugwort',
  'olive',
  'ragweed',
] as const satisfies readonly PollenSpecies[])

export const OPEN_METEO_ENVIRONMENT_REQUEST_CONTRACT: EnvironmentRequestContract = Object.freeze({
  origin: 'https://air-quality-api.open-meteo.com',
  path: '/v1/air-quality',
  timezone: 'auto',
  current: Object.freeze([
    'us_aqi',
    'uv_index',
    ...POLLEN_SPECIES.map((species) => `${species}_pollen`),
  ]),
})

const POLLEN_LABELS: Readonly<Record<PollenSpecies, string>> = Object.freeze({
  alder: 'Alder',
  birch: 'Birch',
  grass: 'Grass',
  mugwort: 'Mugwort',
  olive: 'Olive',
  ragweed: 'Ragweed',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nullableNonNegative(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Invalid environmental weather payload')
  }
  return value
}

function roundedNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Invalid environmental weather value')
  }
  return Math.round(value)
}

export function serializeEnvironmentRequestContract(contract: EnvironmentRequestContract): string {
  const params = new URLSearchParams()
  params.set('timezone', contract.timezone)
  params.set('current', contract.current.join(','))
  return `${contract.origin}${contract.path}?${params.toString()}`
}

export function environmentRequestUrl(lat: number, lon: number): string {
  const normalized = normalizeWeatherCoordinates(lat, lon)
  const url = new URL(serializeEnvironmentRequestContract(OPEN_METEO_ENVIRONMENT_REQUEST_CONTRACT))
  url.searchParams.set('latitude', String(normalized.lat))
  url.searchParams.set('longitude', String(normalized.lon))
  return url.toString()
}

export function environmentRequestIdentity(lat: number, lon: number): string {
  return `open-meteo-air:v1:${environmentRequestUrl(lat, lon)}`
}

export function unavailableEnvironmentSnapshot(
  requestIdentity: string,
  fetchedAt: number,
): WeatherEnvironmentSnapshot {
  return {
    requestIdentity,
    fetchedAt,
    status: 'unavailable',
    usAqi: null,
    uvIndex: null,
    pollen: { status: 'unavailable' },
  }
}

export function mapEnvironmentPayload(
  payload: unknown,
  requestIdentity: string,
  fetchedAt: number,
): WeatherEnvironmentSnapshot {
  if (!isRecord(payload) || !isRecord(payload.current) || !Number.isFinite(fetchedAt) || fetchedAt < 0) {
    throw new Error('Invalid environmental weather payload')
  }

  const current = payload.current
  const readings: PollenReading[] = []
  for (const species of POLLEN_SPECIES) {
    const value = nullableNonNegative(current[`${species}_pollen`])
    if (value !== null) readings.push({ species, grainsPerCubicMeter: value })
  }

  const pollen: WeatherPollenSnapshot = readings.length > 0
    ? { status: 'available', readings }
    : { status: 'unavailable' }

  return {
    requestIdentity,
    fetchedAt,
    status: 'available',
    usAqi: nullableNonNegative(current.us_aqi),
    uvIndex: nullableNonNegative(current.uv_index),
    pollen,
  }
}

export type AqiCategory =
  | 'Good'
  | 'Moderate'
  | 'Unhealthy for sensitive groups'
  | 'Unhealthy'
  | 'Very unhealthy'
  | 'Hazardous'

export function aqiReading(rawValue: number): { value: number; category: AqiCategory } {
  const value = roundedNonNegative(rawValue)
  const category: AqiCategory = value <= 50
    ? 'Good'
    : value <= 100
      ? 'Moderate'
      : value <= 150
        ? 'Unhealthy for sensitive groups'
        : value <= 200
          ? 'Unhealthy'
          : value <= 300
            ? 'Very unhealthy'
            : 'Hazardous'
  return { value, category }
}

export type UvCategory = 'Low' | 'Moderate' | 'High' | 'Very high' | 'Extreme'

export function uvReading(rawValue: number): { value: number; category: UvCategory } {
  const value = roundedNonNegative(rawValue)
  const category: UvCategory = value <= 2
    ? 'Low'
    : value <= 5
      ? 'Moderate'
      : value <= 7
        ? 'High'
        : value <= 10
          ? 'Very high'
          : 'Extreme'
  return { value, category }
}

export type PollenSummary =
  | { kind: 'unavailable' }
  | { kind: 'clear' }
  | { kind: 'reading'; label: string; grainsPerCubicMeter: number }

export function pollenSummary(pollen: WeatherPollenSnapshot): PollenSummary {
  if (pollen.status === 'unavailable' || pollen.readings.length === 0) {
    return { kind: 'unavailable' }
  }
  let dominant = pollen.readings[0]!
  for (const reading of pollen.readings.slice(1)) {
    if (reading.grainsPerCubicMeter > dominant.grainsPerCubicMeter) dominant = reading
  }
  if (dominant.grainsPerCubicMeter === 0) return { kind: 'clear' }
  return {
    kind: 'reading',
    label: POLLEN_LABELS[dominant.species],
    grainsPerCubicMeter: dominant.grainsPerCubicMeter,
  }
}
