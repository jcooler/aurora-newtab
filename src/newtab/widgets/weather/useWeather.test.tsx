// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageProvider } from '../../../lib/storage/context'
import { memoryDriver } from '../../../lib/storage/driver'
import type { StorageDriver } from '../../../lib/storage/driver'
import { createInProcessStorageAuthority } from '../../../lib/storage/authority'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import type { StoredLocation, WeatherSnapshot } from '../../../lib/storage/schema'
import { weatherRequestIdentity } from '../../../services/weather/identity'
import { useWeather } from './useWeather'

const { fetchSnapshot } = vi.hoisted(() => ({ fetchSnapshot: vi.fn() }))

vi.mock('../../../services/weather/openMeteo', () => ({
  openMeteoProvider: () => ({ fetchSnapshot }),
}))

const MAX_AGE_MS = 30 * 60 * 1000
const TEXAS: StoredLocation = { lat: 32.7767, lon: -96.797, label: 'Springfield', manual: true }
const GEORGIA: StoredLocation = { lat: 34.0232, lon: -84.3616, label: 'Springfield', manual: true }

function snapshotFor(
  location: StoredLocation,
  tempC: number,
  overrides: Partial<WeatherSnapshot> = {},
): WeatherSnapshot {
  return {
    current: { tempC, feelsLikeC: tempC, code: 0, windKmh: 5, humidity: 50 },
    hourly: [],
    fetchedAt: Date.now(),
    locationLabel: location.label,
    requestIdentity: weatherRequestIdentity(location.lat, location.lon),
    ...overrides,
  }
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

function isolatedSharedDriver(store: Record<string, unknown>): StorageDriver {
  const listeners = new Set<(changes: Record<string, unknown>) => void>()
  return {
    async read(keys) {
      if (keys === null) return { ...store }
      return Object.fromEntries(keys.filter((key) => key in store).map((key) => [key, store[key]]))
    },
    async write(patch) {
      Object.assign(store, patch)
      for (const listener of listeners) listener(patch)
    },
    onChanged(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

let latest: ReturnType<typeof useWeather> | undefined

function Probe() {
  latest = useWeather()
  return null
}

async function renderProbe({
  location,
  cache,
  strict = false,
}: {
  location: StoredLocation | null
  cache: WeatherSnapshot | null
  strict?: boolean
}): Promise<{ storage: AuroraStorage; unmount: () => void }> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.setMany({ location, weatherCache: cache })
  const child = (
    <StorageProvider storage={storage}>
      <Probe />
    </StorageProvider>
  )
  const view = render(strict ? <StrictMode>{child}</StrictMode> : child)
  await act(async () => {})
  return { storage, unmount: view.unmount }
}

beforeEach(() => {
  latest = undefined
  fetchSnapshot.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useWeather identity and request generations', () => {
  it('suppresses legacy and same-label/different-coordinate caches immediately', async () => {
    const pending = deferred<WeatherSnapshot>()
    fetchSnapshot.mockReturnValue(pending.promise)
    const legacy = { ...snapshotFor(TEXAS, 11), requestIdentity: undefined }
    const first = await renderProbe({ location: TEXAS, cache: legacy })
    expect(latest?.snapshot).toBeNull()
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)
    first.unmount()

    fetchSnapshot.mockReset().mockReturnValue(pending.promise)
    const second = await renderProbe({ location: GEORGIA, cache: snapshotFor(TEXAS, 12) })
    expect(latest?.snapshot).toBeNull()
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)
    second.unmount()
  })

  it('reuses a matching cache and overlays a label-only change without fetching', async () => {
    const renamed = { ...TEXAS, label: 'Dallas' }
    const { storage } = await renderProbe({ location: TEXAS, cache: snapshotFor(TEXAS, 21) })
    expect(latest?.snapshot?.current.tempC).toBe(21)
    expect(fetchSnapshot).not.toHaveBeenCalled()

    await act(async () => {
      await storage.set('location', renamed)
    })
    expect(latest?.snapshot?.locationLabel).toBe('Dallas')
    expect(fetchSnapshot).not.toHaveBeenCalled()
  })

  it('waits for both location and cache hydration before deciding to fetch', async () => {
    const baseDriver = memoryDriver()
    const setupStorage = createStorage(baseDriver)
    await setupStorage.init()
    await setupStorage.setMany({ location: TEXAS, weatherCache: snapshotFor(TEXAS, 21) })
    const cacheRead = deferred<void>()
    const delayedDriver: StorageDriver = {
      read: async (keys) => {
        if (keys?.length === 1 && keys[0] === 'weatherCache') await cacheRead.promise
        return baseDriver.read(keys)
      },
      write: (patch) => baseDriver.write(patch),
      onChanged: (listener) => baseDriver.onChanged(listener),
    }
    const storage = createStorage(delayedDriver, baseDriver.authority)
    const view = render(
      <StorageProvider storage={storage}>
        <Probe />
      </StorageProvider>,
    )
    await act(async () => {})

    expect(fetchSnapshot).not.toHaveBeenCalled()
    await act(async () => {
      cacheRead.resolve()
      await cacheRead.promise
    })
    expect(latest?.snapshot?.current.tempC).toBe(21)
    expect(fetchSnapshot).not.toHaveBeenCalled()
    view.unmount()
  })

  it('starts a newer same-label location immediately and ignores every late old completion path', async () => {
    const oldRequest = deferred<WeatherSnapshot>()
    const newRequest = deferred<WeatherSnapshot>()
    fetchSnapshot.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    const { storage } = await renderProbe({ location: TEXAS, cache: null })
    const oldSignal = fetchSnapshot.mock.calls[0][3].signal as AbortSignal

    await act(async () => {
      await storage.setMany({ location: GEORGIA, weatherCache: null })
    })
    expect(oldSignal.aborted).toBe(true)
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)

    await act(async () => {
      newRequest.resolve(snapshotFor(GEORGIA, 28))
      await newRequest.promise
    })
    expect(latest?.snapshot?.current.tempC).toBe(28)
    expect(latest?.loading).toBe(false)

    await act(async () => {
      oldRequest.resolve(snapshotFor(TEXAS, 9))
      await oldRequest.promise
    })
    expect(latest?.snapshot?.current.tempC).toBe(28)
    expect(latest?.error).toBeNull()
    expect((await storage.get('weatherCache'))?.requestIdentity).toBe(
      weatherRequestIdentity(GEORGIA.lat, GEORGIA.lon),
    )
  })

  it('rejects an old result against the current stored location inside the authority transaction', async () => {
    const oldRequest = deferred<WeatherSnapshot>()
    fetchSnapshot.mockReturnValue(oldRequest.promise)
    const { storage } = await renderProbe({ location: TEXAS, cache: null })

    await act(async () => {
      await storage.setMany({ location: GEORGIA, weatherCache: null })
    })
    fetchSnapshot.mockResolvedValue(snapshotFor(GEORGIA, 30))
    await act(async () => {
      oldRequest.resolve(snapshotFor(TEXAS, 8))
      await oldRequest.promise
    })
    expect(await storage.get('weatherCache')).not.toMatchObject({
      requestIdentity: weatherRequestIdentity(TEXAS.lat, TEXAS.lon),
    })
  })

  it('rechecks stored ownership inside updateMany when another context changes location silently', async () => {
    const store: Record<string, unknown> = {}
    const authority = createInProcessStorageAuthority()
    const mountedStorage = createStorage(isolatedSharedDriver(store), authority)
    const otherContextStorage = createStorage(isolatedSharedDriver(store), authority)
    await mountedStorage.init()
    await otherContextStorage.init()
    await mountedStorage.setMany({ location: TEXAS, weatherCache: null })
    const pending = deferred<WeatherSnapshot>()
    fetchSnapshot.mockReturnValue(pending.promise)
    const updateMany = vi.spyOn(mountedStorage, 'updateMany')
    const view = render(
      <StorageProvider storage={mountedStorage}>
        <Probe />
      </StorageProvider>,
    )
    await act(async () => {})

    // This write shares the real authority/store but intentionally has its
    // own change-listener surface, modeling another extension context whose
    // echo has not reached the mounted React tree yet.
    await otherContextStorage.setMany({ location: GEORGIA, weatherCache: null })
    await act(async () => {
      pending.resolve(snapshotFor(TEXAS, 8))
      await pending.promise
    })

    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(await mountedStorage.get('location')).toEqual(GEORGIA)
    expect(await mountedStorage.get('weatherCache')).toBeNull()
    view.unmount()
  })

  it('keeps the newer request state when an aborted older request rejects late', async () => {
    const oldRequest = deferred<WeatherSnapshot>()
    const newRequest = deferred<WeatherSnapshot>()
    fetchSnapshot.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    const { storage } = await renderProbe({ location: TEXAS, cache: null })
    await act(async () => {
      await storage.setMany({ location: GEORGIA, weatherCache: null })
    })
    await act(async () => {
      newRequest.resolve(snapshotFor(GEORGIA, 28))
      await newRequest.promise
    })
    await act(async () => {
      oldRequest.reject(new Error('late old failure'))
      await oldRequest.promise.catch(() => undefined)
    })

    expect(latest?.snapshot?.current.tempC).toBe(28)
    expect(latest?.loading).toBe(false)
    expect(latest?.error).toBeNull()
    expect((await storage.get('weatherCache'))?.requestIdentity).toBe(
      weatherRequestIdentity(GEORGIA.lat, GEORGIA.lon),
    )
  })

  it('clearing location aborts and old work cannot recreate the cache', async () => {
    const pending = deferred<WeatherSnapshot>()
    fetchSnapshot.mockReturnValue(pending.promise)
    const { storage } = await renderProbe({ location: TEXAS, cache: null })
    const signal = fetchSnapshot.mock.calls[0][3].signal as AbortSignal
    await act(async () => {
      await storage.setMany({ location: null, weatherCache: null })
    })
    expect(signal.aborted).toBe(true)
    await act(async () => {
      pending.resolve(snapshotFor(TEXAS, 5))
      await pending.promise
    })
    expect(await storage.get('weatherCache')).toBeNull()
    expect(latest?.snapshot).toBeNull()
  })

  it('keeps a later atomic location/cache clear when the old request committed first', async () => {
    const nextRequest = deferred<WeatherSnapshot>()
    fetchSnapshot
      .mockResolvedValueOnce(snapshotFor(TEXAS, 19))
      .mockReturnValueOnce(nextRequest.promise)
    const { storage, unmount } = await renderProbe({ location: TEXAS, cache: null })
    expect((await storage.get('weatherCache'))?.current.tempC).toBe(19)

    await act(async () => {
      await storage.setMany({ location: GEORGIA, weatherCache: null })
    })
    expect(await storage.get('weatherCache')).toBeNull()
    unmount()
  })

  it('aborts on unmount and ignores a late settlement', async () => {
    const pending = deferred<WeatherSnapshot>()
    fetchSnapshot.mockReturnValue(pending.promise)
    const { storage, unmount } = await renderProbe({ location: TEXAS, cache: null })
    const signal = fetchSnapshot.mock.calls[0][3].signal as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)

    await act(async () => {
      pending.resolve(snapshotFor(TEXAS, 6))
      await pending.promise
    })
    expect(await storage.get('weatherCache')).toBeNull()
  })

  it('dedupes same-identity refresh and permits a retry after current failure', async () => {
    const first = deferred<WeatherSnapshot>()
    const second = deferred<WeatherSnapshot>()
    fetchSnapshot.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await renderProbe({ location: TEXAS, cache: null })
    await act(async () => {
      void latest?.refresh()
      void latest?.refresh()
    })
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.reject(new Error('offline'))
      await first.promise.catch(() => undefined)
    })
    expect(latest?.error).toBe('offline')

    await act(async () => {
      void latest?.refresh()
    })
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
    await act(async () => {
      second.resolve(snapshotFor(TEXAS, 23))
      await second.promise
    })
    expect(latest?.error).toBeNull()
    expect(latest?.snapshot?.current.tempC).toBe(23)
  })

  it('refreshes at the exact TTL and visibility convergence does not overlap', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'))
    const pending = deferred<WeatherSnapshot>()
    fetchSnapshot.mockReturnValue(pending.promise)
    const cache = snapshotFor(TEXAS, 21, { fetchedAt: Date.now() - MAX_AGE_MS + 1 })
    await renderProbe({ location: TEXAS, cache })
    expect(fetchSnapshot).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)
  })

  it('guards invalid stored coordinates and remains operable in Strict Mode', async () => {
    const invalid = { ...TEXAS, lat: 91 }
    const { storage } = await renderProbe({ location: invalid, cache: null, strict: true })
    expect(latest?.snapshot).toBeNull()
    expect(latest?.error).toBe('Invalid weather coordinates')
    expect(fetchSnapshot).not.toHaveBeenCalled()
    await act(async () => {
      await expect(storage.setMany({ location: null, weatherCache: null })).resolves.toBeUndefined()
    })
  })
})
