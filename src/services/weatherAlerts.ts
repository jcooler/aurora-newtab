import type { WeatherAlert, WeatherAlertSeverity } from '../lib/storage/schema'
import { getJson } from './connectors/http'
import { normalizeWeatherCoordinates } from './weather/identity'

const NWS_ALERTS_ORIGIN = 'https://api.weather.gov'
const MAX_ALERTS = 12
const SEVERITY_ORDER: Record<WeatherAlertSeverity, number> = {
  Extreme: 0,
  Severe: 1,
  Moderate: 2,
  Minor: 3,
  Unknown: 4,
}
const SEVERITIES = new Set<WeatherAlertSeverity>(['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'])

export type WeatherAlertsResult =
  | { status: 'supported'; alerts: WeatherAlert[] }
  | { status: 'unsupported' }

export function weatherAlertRequestUrl(lat: number, lon: number): string {
  const point = normalizeWeatherCoordinates(lat, lon)
  return `${NWS_ALERTS_ORIGIN}/alerts/active?point=${point.lat},${point.lon}`
}

export function weatherAlertRequestIdentity(lat: number, lon: number): string {
  return `nws-alerts:v1:${weatherAlertRequestUrl(lat, lon)}`
}

export async function fetchWeatherAlerts(
  lat: number,
  lon: number,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<WeatherAlertsResult> {
  try {
    const scopedFetch: typeof fetch = signal
      ? async (input, init) => fetchFn(input, { ...init, signal: mergedSignal(init?.signal, signal) })
      : fetchFn
    const result = await getJson<unknown>(
      weatherAlertRequestUrl(lat, lon),
      { Accept: 'application/geo+json' },
      scopedFetch,
    )
    if (!result.ok) {
      if (result.status === 400 || result.status === 404) return { status: 'unsupported' }
      throw new Error('request failed')
    }
    const alerts = normalizeFeatureCollection(result.body)
    if (!alerts) throw new Error('invalid response')
    return { status: 'supported', alerts }
  } catch {
    throw new Error('NWS weather alerts are unavailable.')
  }
}

function mergedSignal(first: AbortSignal | null | undefined, second: AbortSignal): AbortSignal {
  if (!first) return second
  if (first.aborted || second.aborted) return AbortSignal.abort()
  const controller = new AbortController()
  const abort = () => controller.abort()
  first.addEventListener('abort', abort, { once: true })
  second.addEventListener('abort', abort, { once: true })
  return controller.signal
}

function normalizeFeatureCollection(value: unknown): WeatherAlert[] | null {
  if (!isObject(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) return null
  return value.features
    .map(normalizeFeature)
    .filter((alert): alert is WeatherAlert => alert !== null)
    .sort((a, b) => {
      const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      if (severity !== 0) return severity
      return expiryOrder(a.expires) - expiryOrder(b.expires)
    })
    .slice(0, MAX_ALERTS)
}

function normalizeFeature(value: unknown): WeatherAlert | null {
  if (!isObject(value) || !isObject(value.properties)) return null
  const properties = value.properties
  const id = safeAlertId(value.id)
  const event = boundedText(properties.event, 160)
  const headline = boundedText(properties.headline, 320)
  const areaDescription = boundedText(properties.areaDesc, 320)
  if (!id || !event || !headline || !areaDescription) return null
  const severity = SEVERITIES.has(properties.severity as WeatherAlertSeverity)
    ? properties.severity as WeatherAlertSeverity
    : 'Unknown'
  return {
    id,
    event,
    severity,
    urgency: boundedText(properties.urgency, 80) || 'Unknown',
    headline,
    areaDescription,
    effective: isoDate(properties.effective),
    onset: isoDate(properties.onset),
    expires: isoDate(properties.expires),
    description: boundedText(properties.description, 2_000),
    instruction: boundedText(properties.instruction, 1_000),
  }
}

function safeAlertId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.origin === NWS_ALERTS_ORIGIN && url.pathname.startsWith('/alerts/') ? url.toString() : null
  } catch {
    return null
  }
}

function boundedText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

function expiryOrder(value: string | null): number {
  return value ? Date.parse(value) : Number.POSITIVE_INFINITY
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
