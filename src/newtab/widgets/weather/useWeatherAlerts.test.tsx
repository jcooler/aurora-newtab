// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createStorage } from '../../../lib/storage'
import { StorageProvider } from '../../../lib/storage/context'
import { memoryDriver } from '../../../lib/storage/driver'
import type { StoredLocation, WeatherAlertCache } from '../../../lib/storage/schema'
import { weatherAlertRequestIdentity } from '../../../services/weatherAlerts'
import { useWeatherAlerts } from './useWeatherAlerts'

const { fetchWeatherAlerts } = vi.hoisted(() => ({ fetchWeatherAlerts: vi.fn() }))
vi.mock('../../../services/weatherAlerts', async (importActual) => ({
  ...await importActual<typeof import('../../../services/weatherAlerts')>(),
  fetchWeatherAlerts,
}))

const NOW = new Date('2026-08-22T12:00:00Z').getTime()
const TEXAS: StoredLocation = { lat: 32.7767, lon: -96.797, label: 'Dallas', manual: true }
const GEORGIA: StoredLocation = { lat: 34.0232, lon: -84.3616, label: 'Dallas', manual: true }
const alert = {
  id: 'https://api.weather.gov/alerts/urn:oid:test',
  event: 'Severe Thunderstorm Warning',
  severity: 'Severe' as const,
  urgency: 'Immediate',
  headline: 'Severe thunderstorms are moving through Dallas County',
  areaDescription: 'Dallas County',
  effective: '2026-08-22T12:00:00.000Z',
  onset: '2026-08-22T12:00:00.000Z',
  expires: '2026-08-22T13:00:00.000Z',
  description: 'Damaging winds are possible.',
  instruction: 'Move indoors.',
}

function cacheFor(location: StoredLocation, fetchedAt = NOW): WeatherAlertCache {
  return {
    requestIdentity: weatherAlertRequestIdentity(location.lat, location.lon),
    fetchedAt,
    status: 'supported',
    alerts: [alert],
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

let latest: ReturnType<typeof useWeatherAlerts> | undefined
function Probe() {
  latest = useWeatherAlerts()
  return null
}

async function mount(location: StoredLocation | null, cache: WeatherAlertCache | null) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.setMany({ location, weatherAlertCache: cache })
  const view = render(<StorageProvider storage={storage}><Probe /></StorageProvider>)
  await act(async () => {})
  return { storage, view }
}

beforeEach(() => {
  latest = undefined
  fetchWeatherAlerts.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useWeatherAlerts', () => {
  it('deduplicates same-point work and commits one identity-owned cache', async () => {
    const pending = deferred<{ status: 'supported'; alerts: typeof alert[] }>()
    fetchWeatherAlerts.mockReturnValue(pending.promise)
    const { storage } = await mount(TEXAS, null)
    const first = latest?.refresh()
    const second = latest?.refresh()
    expect(fetchWeatherAlerts).toHaveBeenCalledTimes(1)
    pending.resolve({ status: 'supported', alerts: [alert] })
    await act(async () => { await Promise.all([first, second]) })
    expect((await storage.get('weatherAlertCache'))?.requestIdentity).toBe(
      weatherAlertRequestIdentity(TEXAS.lat, TEXAS.lon),
    )
  })

  it('refreshes a fresh matching cache only after five visible minutes', async () => {
    fetchWeatherAlerts.mockResolvedValue({ status: 'supported', alerts: [] })
    await mount(TEXAS, cacheFor(TEXAS))
    expect(fetchWeatherAlerts).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000 - 1) })
    expect(fetchWeatherAlerts).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(2) })
    expect(fetchWeatherAlerts).toHaveBeenCalledTimes(1)
  })

  it('aborts old work and cannot write after the stored location changes', async () => {
    const pending = deferred<{ status: 'supported'; alerts: typeof alert[] }>()
    const replacement = deferred<{ status: 'supported'; alerts: typeof alert[] }>()
    fetchWeatherAlerts.mockReturnValueOnce(pending.promise).mockReturnValueOnce(replacement.promise)
    const { storage } = await mount(TEXAS, null)
    const signal = fetchWeatherAlerts.mock.calls[0]?.[3] as AbortSignal
    await act(async () => { await storage.setMany({ location: GEORGIA, weatherAlertCache: null }) })
    expect(signal.aborted).toBe(true)
    pending.resolve({ status: 'supported', alerts: [alert] })
    await act(async () => { await pending.promise })
    expect(await storage.get('weatherAlertCache')).toBeNull()
  })

  it('retains matching stale alert data when refresh fails', async () => {
    fetchWeatherAlerts.mockRejectedValue(new Error('private failure'))
    const stale = cacheFor(TEXAS, NOW - 5 * 60_000)
    await mount(TEXAS, stale)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(latest?.error).toBe('NWS weather alerts are unavailable.')
    expect(latest?.snapshot).toEqual(stale)
  })

  it('retries a failed visible request on a bounded cadence', async () => {
    fetchWeatherAlerts
      .mockRejectedValueOnce(new Error('private failure'))
      .mockResolvedValueOnce({ status: 'supported', alerts: [] })
    await mount(TEXAS, null)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(fetchWeatherAlerts).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(29_999) })
    expect(fetchWeatherAlerts).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(fetchWeatherAlerts).toHaveBeenCalledTimes(2)
  })

  it('cannot repopulate an alert cache after an identical-location restore clears it', async () => {
    const beforeRestore = deferred<{ status: 'supported'; alerts: typeof alert[] }>()
    const afterRestore = deferred<{ status: 'supported'; alerts: typeof alert[] }>()
    fetchWeatherAlerts
      .mockReturnValueOnce(beforeRestore.promise)
      .mockReturnValueOnce(afterRestore.promise)
    const { storage } = await mount(TEXAS, null)
    const restored = { ...await storage.snapshot(), weatherAlertCache: null }
    await act(async () => {
      await storage.replaceAllWithRollback(restored, async () => undefined)
      await Promise.resolve()
    })
    expect(fetchWeatherAlerts).toHaveBeenCalledTimes(2)
    beforeRestore.resolve({ status: 'supported', alerts: [alert] })
    await act(async () => { await beforeRestore.promise; await Promise.resolve() })
    expect(await storage.get('weatherAlertCache')).toBeNull()
    afterRestore.resolve({ status: 'supported', alerts: [] })
    await act(async () => { await afterRestore.promise; await Promise.resolve() })
    expect((await storage.get('weatherAlertCache'))?.alerts).toEqual([])
  })

  it('persists unsupported coverage as a truthful cache state', async () => {
    fetchWeatherAlerts.mockResolvedValue({ status: 'unsupported' })
    const { storage } = await mount(TEXAS, null)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect((await storage.get('weatherAlertCache'))?.status).toBe('unsupported')
    expect(latest?.snapshot?.status).toBe('unsupported')
  })
})
