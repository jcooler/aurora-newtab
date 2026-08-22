import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchWeatherAlerts,
  weatherAlertRequestIdentity,
  weatherAlertRequestUrl,
} from './weatherAlerts'

const point = { lat: 32.77674, lon: -96.79704 }

function feature(overrides: Record<string, unknown> = {}) {
  return {
    id: 'https://api.weather.gov/alerts/urn:oid:alert-1',
    type: 'Feature',
    properties: {
      event: 'Severe Thunderstorm Warning',
      severity: 'Severe',
      urgency: 'Immediate',
      headline: 'Severe Thunderstorm Warning issued for Dallas County',
      areaDesc: 'Dallas County',
      effective: '2026-08-22T12:00:00Z',
      onset: '2026-08-22T12:05:00Z',
      expires: '2026-08-22T13:00:00Z',
      description: 'Heavy rain and damaging winds.',
      instruction: 'Move indoors.',
      ...overrides,
    },
  }
}

afterEach(() => vi.useRealTimers())

describe('NWS weather alerts', () => {
  it('uses rounded Weather coordinates in the exact point URL and identity', () => {
    expect(weatherAlertRequestUrl(point.lat, point.lon)).toBe(
      'https://api.weather.gov/alerts/active?point=32.7767,-96.797',
    )
    expect(weatherAlertRequestIdentity(point.lat, point.lon)).toBe(
      'nws-alerts:v1:https://api.weather.gov/alerts/active?point=32.7767,-96.797',
    )
  })

  it('requests GeoJSON, bounds to 12 alerts, and sorts severity then earliest expiry', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toEqual({ Accept: 'application/geo+json' })
      const severities = ['Minor', 'Moderate', 'Severe', 'Extreme', 'Unknown']
      const features = Array.from({ length: 14 }, (_, index) => feature({
        severity: severities[index % severities.length],
        event: `Alert ${index}`,
        expires: `2026-08-22T${String(23 - index).padStart(2, '0')}:00:00Z`,
        description: 'x'.repeat(3_000),
        instruction: 'y'.repeat(2_000),
      }))
      return new Response(JSON.stringify({ type: 'FeatureCollection', features }), {
        status: 200,
        headers: { 'Content-Type': 'application/geo+json' },
      })
    }) as typeof fetch

    const result = await fetchWeatherAlerts(point.lat, point.lon, fetchFn)
    expect(result.status).toBe('supported')
    if (result.status !== 'supported') return
    expect(result.alerts).toHaveLength(12)
    expect(result.alerts.map((alert) => alert.severity).slice(0, 3)).toEqual(['Extreme', 'Extreme', 'Extreme'])
    expect(result.alerts[0]?.expires).toBe('2026-08-22T10:00:00.000Z')
    expect(result.alerts[0]?.description.length).toBeLessThanOrEqual(2_000)
    expect(result.alerts[0]?.instruction.length).toBeLessThanOrEqual(1_000)
  })

  it.each([400, 404])('treats HTTP %s as unsupported coverage', async (status) => {
    const fetchFn = vi.fn(async () => new Response('{}', { status })) as typeof fetch
    await expect(fetchWeatherAlerts(point.lat, point.lon, fetchFn)).resolves.toEqual({ status: 'unsupported' })
  })

  it('aborts after eight seconds and exposes no provider body in its error', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('sensitive provider body')))
    })) as typeof fetch
    const pending = fetchWeatherAlerts(point.lat, point.lon, fetchFn)
    const rejected = expect(pending).rejects.toThrow('NWS weather alerts are unavailable.')
    await vi.advanceTimersByTimeAsync(8_001)
    await rejected
  })
})
