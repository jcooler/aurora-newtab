// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../storage/index'
import { memoryDriver } from '../storage/driver'
import { StorageProvider } from '../storage/context'
import type { IcsConfig, RssConfig } from '../../services/connectors/types'
import { connectorSnapshotScope } from '../../services/connectors/snapshotIdentity'
import { useConnectorSnapshot, __resetInFlight } from './useConnectorSnapshot'

const configA: RssConfig = {
  enabled: true,
  feeds: ['https://feeds.example/account-a'],
  shownCount: 5,
}
const configB: RssConfig = {
  enabled: true,
  feeds: ['https://feeds.example/account-b'],
  shownCount: 5,
}

const icsConfig: IcsConfig = {
  enabled: true,
  calendars: [{ name: 'Work', url: 'https://calendar.example/work.ics' }],
}
const icsConfigWithColor: IcsConfig = {
  ...icsConfig,
  calendars: [{ ...icsConfig.calendars![0]!, color: 'fuchsia' }],
}

beforeAll(() => {
  const digest = vi.fn(async (_algorithm: AlgorithmIdentifier, source: BufferSource) => {
    const bytes =
      source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    const output = new Uint8Array(32)
    bytes.forEach((byte, index) => {
      const slot = index % output.length
      output[slot] = ((output[slot] ?? 0) * 33 + byte + index) & 0xff
    })
    return output.buffer
  })
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    value: { digest },
  })
})

beforeEach(() => {
  __resetInFlight()
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
})

afterEach(() => {
  __resetInFlight()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function Probe({
  config,
  refresh,
  ttl,
  runtimeScope,
  isData,
}: {
  config: RssConfig
  refresh: (prev: string | null) => Promise<string>
  ttl?: number
  runtimeScope?: unknown
  isData?: (value: unknown) => value is string
}) {
  const { data, fetchedAt, refreshing, lastError, state } = useConnectorSnapshot(
    'rss',
    config,
    refresh,
    ttl,
    runtimeScope,
    isData,
  )
  return (
    <ul>
      <li>{'data:' + (data ?? 'none')}</li>
      <li>{'fetchedAt:' + (fetchedAt ?? 'null')}</li>
      <li>{'refreshing:' + refreshing}</li>
      <li>{'error:' + (lastError ?? 'null')}</li>
      <li>{'operation:' + state.operation}</li>
      <li>{'freshness:' + state.freshness}</li>
      <li>{'hasData:' + state.hasData}</li>
    </ul>
  )
}

async function freshStorage(
  config: RssConfig = configA,
  seed?: { fetchedAt: number; data: unknown },
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { rss: config })
  if (seed) {
    await storage.set('connectorSnapshots', {
      rss: { ...seed, scope: await connectorSnapshotScope('rss', config) },
    })
  }
  return storage
}

function mount(
  storage: AuroraStorage,
  refresh: (prev: string | null) => Promise<string>,
  ttl?: number,
  config: RssConfig = configA,
  runtimeScope?: unknown,
  isData?: (value: unknown) => value is string,
) {
  return render(
    <StorageProvider storage={storage}>
      <Probe config={config} refresh={refresh} ttl={ttl} runtimeScope={runtimeScope} isData={isData} />
    </StorageProvider>,
  )
}

function IcsProbe({
  config,
  refresh,
  ttl,
}: {
  config: IcsConfig
  refresh: (prev: string | null) => Promise<string>
  ttl?: number
}) {
  const { data, refreshing } = useConnectorSnapshot('ics', config, refresh, ttl)
  return <p>{`ics:${data ?? 'none'}:${refreshing}`}</p>
}

async function freshIcsStorage(
  config: IcsConfig = icsConfig,
  seed?: { fetchedAt: number; data: string },
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { ics: config })
  if (seed) {
    await storage.set('connectorSnapshots', {
      ics: { ...seed, scope: await connectorSnapshotScope('ics', config) },
    })
  }
  return storage
}

function mountIcs(
  storage: AuroraStorage,
  refresh: (prev: string | null) => Promise<string>,
  ttl: number,
  config: IcsConfig,
) {
  return render(
    <StorageProvider storage={storage}>
      <IcsProbe config={config} refresh={refresh} ttl={ttl} />
    </StorageProvider>,
  )
}

describe('useConnectorSnapshot', () => {
  it('exports literal semantic state for no data, freshness boundaries, retained failures, and retries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'))

    const noDataStorage = await freshStorage()
    const initial = deferred<string>()
    const noDataView = mount(noDataStorage, () => initial.promise, 1_000)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('operation:pending')).toBeTruthy()
    expect(screen.getByText('freshness:unknown')).toBeTruthy()
    expect(screen.getByText('hasData:false')).toBeTruthy()
    await act(async () => {
      initial.reject(new Error('unavailable'))
      await initial.promise.catch(() => undefined)
    })
    expect(screen.getByText('operation:error')).toBeTruthy()
    expect(screen.getByText('freshness:unknown')).toBeTruthy()
    expect(screen.getByText('hasData:false')).toBeTruthy()
    noDataView.unmount()

    const freshStorageInstance = await freshStorage(configA, {
      fetchedAt: Date.now(),
      data: 'fresh-cache',
    })
    const freshView = mount(freshStorageInstance, () => Promise.resolve('unused'), 1_000)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('operation:success')).toBeTruthy()
    expect(screen.getByText('freshness:fresh')).toBeTruthy()
    expect(screen.getByText('hasData:true')).toBeTruthy()
    freshView.unmount()

    const cachedStorage = await freshStorage(configA, {
      fetchedAt: Date.now() - 1_000,
      data: 'cached-data',
    })
    const first = deferred<string>()
    const second = deferred<string>()
    const refresh = vi
      .fn<(_: string | null) => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    mount(cachedStorage, refresh, 1_000)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('operation:pending')).toBeTruthy()
    expect(screen.getByText('freshness:stale')).toBeTruthy()
    expect(screen.getByText('hasData:true')).toBeTruthy()

    await act(async () => {
      first.reject(new Error('offline'))
      await first.promise.catch(() => undefined)
    })
    expect(screen.getByText('operation:error')).toBeTruthy()
    expect(screen.getByText('freshness:stale')).toBeTruthy()
    expect(screen.getByText('hasData:true')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(screen.getByText('operation:pending')).toBeTruthy()
    expect(screen.getByText('freshness:stale')).toBeTruthy()
    expect(screen.getByText('hasData:true')).toBeTruthy()

    await act(async () => {
      second.reject(new Error('offline again'))
      await second.promise.catch(() => undefined)
    })
  })

  it('fresh mount with no snapshot: refresh runs once and the result is written with a fetchedAt', async () => {
    const storage = await freshStorage()
    const refresh = vi.fn(() => Promise.resolve('fresh-data'))

    mount(storage, refresh)
    await act(async () => {
      await tick()
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    await screen.findByText('data:fresh-data')
    const stored = (await storage.get('connectorSnapshots')).rss
    expect(stored?.scope).toBe(await connectorSnapshotScope('rss', configA))
    expect(stored?.data).toBe('fresh-data')
    expect(typeof stored?.fetchedAt).toBe('number')
    expect(stored?.fetchedAt).toBeGreaterThan(0)
  })

  it('stale snapshot: cached data is returned IMMEDIATELY, then refresh follows and updates it', async () => {
    const storage = await freshStorage(configA, {
      fetchedAt: Date.now() - 10_000,
      data: 'stale-data',
    })
    const pending = deferred<string>()
    const refresh = vi.fn(() => pending.promise)

    mount(storage, refresh, 1_000)

    await screen.findByText('data:stale-data')
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve('fresh-data')
      await tick()
    })
    await screen.findByText('data:fresh-data')
  })

  it('stale snapshot: refresh is called with the PREVIOUS cached data object', async () => {
    const storage = await freshStorage(configA, {
      fetchedAt: Date.now() - 10_000,
      data: 'stale-data',
    })
    const refresh = vi.fn((_prev: string | null) => Promise.resolve('fresh-data'))

    mount(storage, refresh, 1_000)
    await act(async () => {
      await tick()
    })

    expect(refresh).toHaveBeenCalledWith('stale-data')
  })

  it('no snapshot at all: refresh is called with null', async () => {
    const storage = await freshStorage()
    const refresh = vi.fn((_prev: string | null) => Promise.resolve('fresh-data'))

    mount(storage, refresh)
    await act(async () => {
      await tick()
    })

    expect(refresh).toHaveBeenCalledWith(null)
  })

  it('fresh-enough snapshot: no refresh', async () => {
    const storage = await freshStorage(configA, {
      fetchedAt: Date.now(),
      data: 'cached',
    })
    const refresh = vi.fn(() => Promise.resolve('should-not-run'))

    mount(storage, refresh, 60_000)
    await act(async () => {
      await tick()
    })

    await screen.findByText('data:cached')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('two mounted consumers: exactly one refresh (in-flight dedupe)', async () => {
    const storage = await freshStorage()
    const refresh = vi.fn(() => Promise.resolve('shared'))

    render(
      <StorageProvider storage={storage}>
        <Probe config={configA} refresh={refresh} />
        <Probe config={configA} refresh={refresh} />
      </StorageProvider>,
    )
    await act(async () => {
      await tick()
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    const stored = (await storage.get('connectorSnapshots')).rss
    expect(stored?.data).toBe('shared')
  })

  it('refresh does not re-run on an unrelated re-render (once per mount)', async () => {
    const storage = await freshStorage()
    const refresh = vi.fn(() => Promise.resolve('once'))

    let rerender!: () => void
    function Wrapper() {
      const [, setN] = useState(0)
      rerender = () => setN((value) => value + 1)
      return <Probe config={configA} refresh={refresh} />
    }
    render(
      <StorageProvider storage={storage}>
        <Wrapper />
      </StorageProvider>,
    )
    await act(async () => {
      await tick()
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      rerender()
      await tick()
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('different-account reconnect never renders the previous fresh cache', async () => {
    const storage = await freshStorage(configA, {
      fetchedAt: Date.now(),
      data: 'account-a',
    })
    await storage.set('connectors', { rss: configB })
    const pending = deferred<string>()
    const refresh = vi.fn(() => pending.promise)

    mount(storage, refresh, 60_000, configB)
    await act(async () => {
      await tick()
    })

    expect(screen.queryByText('data:account-a')).toBeNull()
    expect(screen.getByText('data:none')).toBeTruthy()
    expect(refresh).toHaveBeenCalledWith(null)
  })

  it('mounted config mutation suppresses old data before the new request settles', async () => {
    const storage = await freshStorage(configA, {
      fetchedAt: Date.now(),
      data: 'account-a',
    })
    const pending = deferred<string>()
    const refresh = vi.fn(() => pending.promise)
    const view = mount(storage, refresh, 60_000, configA)
    await screen.findByText('data:account-a')

    await storage.set('connectors', { rss: configB })
    view.rerender(
      <StorageProvider storage={storage}>
        <Probe config={configB} refresh={refresh} ttl={60_000} />
      </StorageProvider>,
    )

    expect(screen.queryByText('data:account-a')).toBeNull()
    expect(screen.getByText('data:none')).toBeTruthy()

    await act(async () => {
      pending.resolve('account-b')
      await tick()
    })
  })

  it('color-only ICS config changes keep an in-flight refresh owned and publish its result', async () => {
    const storage = await freshIcsStorage(icsConfig, {
      fetchedAt: Date.now() - 10_000,
      data: 'stale-event-data',
    })
    const pending = deferred<string>()
    const refresh = vi.fn(() => pending.promise)
    const view = mountIcs(storage, refresh, 1_000, icsConfig)

    await screen.findByText('ics:stale-event-data:true')
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      await storage.set('connectors', { ics: icsConfigWithColor })
      view.rerender(
        <StorageProvider storage={storage}>
          <IcsProbe config={icsConfigWithColor} refresh={refresh} ttl={1_000} />
        </StorageProvider>,
      )
      await tick()
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve('fresh-event-data')
      await tick()
    })

    await screen.findByText('ics:fresh-event-data:false')
    const snapshot = (await storage.get('connectorSnapshots')).ics
    expect(snapshot?.scope).toBe(await connectorSnapshotScope('ics', icsConfigWithColor))
    expect(snapshot?.data).toBe('fresh-event-data')
  })

  it('commit-time invalidation rejects A when it resolves immediately after the B rerender', async () => {
    const storage = await freshStorage()
    const requestA = deferred<string>()
    const requestB = deferred<string>()
    const refresh = vi
      .fn<(_: string | null) => Promise<string>>()
      .mockReturnValueOnce(requestA.promise)
      .mockReturnValueOnce(requestB.promise)
    const view = mount(storage, refresh, 60_000, configA)
    await act(async () => {
      await tick()
    })

    await storage.set('connectors', { rss: configB })
    view.rerender(
      <StorageProvider storage={storage}>
        <Probe config={configB} refresh={refresh} ttl={60_000} />
      </StorageProvider>,
    )
    await act(async () => {
      requestA.resolve('account-a')
      await Promise.resolve()
    })

    const stored = (await storage.get('connectorSnapshots')).rss
    expect(stored?.data).not.toBe('account-a')

    await act(async () => {
      requestB.resolve('account-b')
      await tick()
    })
  })

  it('rejects a pending response when authoritative storage disables the connector before React rerenders', async () => {
    const storage = await freshStorage()
    const pending = deferred<string>()
    mount(storage, () => pending.promise, 60_000, configA)
    await act(async () => {
      await tick()
    })

    // Atomic restore commits connector config and clears derived snapshots in
    // one authority-held write. The old component may not have rerendered yet,
    // so its render-local generation alone is insufficient commit authority.
    await storage.updateMany(['connectors', 'connectorSnapshots'], () => ({
      connectors: { rss: { ...configA, enabled: false } },
      connectorSnapshots: {},
    }))
    await act(async () => {
      pending.resolve('stale-after-restore')
      await tick()
    })

    expect((await storage.get('connectorSnapshots')).rss).toBeUndefined()
  })

  it('rejects a pending response when an identical-config restore clears derived snapshots', async () => {
    const storage = await freshStorage()
    const beforeRestore = deferred<string>()
    const afterRestore = deferred<string>()
    const refresh = vi.fn()
      .mockReturnValueOnce(beforeRestore.promise)
      .mockReturnValueOnce(afterRestore.promise)
    mount(storage, refresh, 60_000, configA)
    await act(async () => { await tick() })

    const restored = { ...await storage.snapshot(), connectorSnapshots: {} }
    await act(async () => {
      await storage.replaceAllWithRollback(restored, async () => undefined)
      await tick()
    })
    expect(refresh).toHaveBeenCalledTimes(2)
    await act(async () => {
      beforeRestore.resolve('stale-after-identical-restore')
      await tick()
    })

    expect((await storage.get('connectorSnapshots')).rss).toBeUndefined()
    await act(async () => {
      afterRestore.resolve('fresh-after-identical-restore')
      await tick()
    })
    expect((await storage.get('connectorSnapshots')).rss?.data).toBe('fresh-after-identical-restore')
  })

  it('does not start an old-owner refresh after authoritative disconnect before React rerenders', async () => {
    const storage = await freshStorage(configA, {
      fetchedAt: Date.now(),
      data: 'account-a',
    })
    const refresh = vi.fn(() => Promise.resolve('must-not-run'))
    mount(storage, refresh, 60_000, configA)
    await screen.findByText('data:account-a')
    expect(refresh).not.toHaveBeenCalled()

    await act(async () => {
      await storage.updateMany(['connectors', 'connectorSnapshots'], () => ({
        connectors: {},
        connectorSnapshots: {},
      }))
      await tick()
    })

    expect(refresh).not.toHaveBeenCalled()
    expect((await storage.get('connectorSnapshots')).rss).toBeUndefined()
  })

  it('treats a removed snapshot key as an empty map and refreshes without crashing', async () => {
    const driver = memoryDriver()
    const storage = createStorage(driver)
    await storage.init()
    await storage.set('connectors', { rss: configA })
    await storage.set('connectorSnapshots', {
      rss: {
        scope: await connectorSnapshotScope('rss', configA),
        fetchedAt: Date.now(),
        data: 'cached',
      },
    })
    const refresh = vi.fn(() => Promise.resolve('replacement'))

    mount(storage, refresh, 60_000, configA)
    await screen.findByText('data:cached')
    expect(refresh).not.toHaveBeenCalled()

    await act(async () => {
      // Chrome reports a removed storage key to subscribers as undefined.
      await driver.write({ connectorSnapshots: undefined })
      await tick()
    })

    expect(refresh).toHaveBeenCalledWith(null)
    expect(screen.getByText('data:replacement')).toBeTruthy()
  })

  it('a queued scope A write rechecks ownership after scope B commits', async () => {
    const driver = memoryDriver()
    const storage = createStorage(driver)
    await storage.init()
    await storage.set('connectors', { rss: configA })

    const queueEntered = deferred<void>()
    const releaseQueue = deferred<void>()
    const read = driver.read.bind(driver)
    let blockNextSnapshotRead = true
    driver.read = async (keys) => {
      if (blockNextSnapshotRead && keys?.includes('connectorSnapshots')) {
        blockNextSnapshotRead = false
        queueEntered.resolve()
        await releaseQueue.promise
      }
      return read(keys)
    }

    const priorUpdate = storage.update('connectorSnapshots', (snapshots) => snapshots)
    await queueEntered.promise

    const requestB = deferred<string>()
    const refresh = vi
      .fn<(_: string | null) => Promise<string>>()
      .mockResolvedValueOnce('account-a')
      .mockReturnValueOnce(requestB.promise)
    const updateMany = vi.spyOn(storage, 'updateMany')
    const view = mount(storage, refresh, 60_000, configA)
    await act(async () => {
      await tick()
    })
    expect(updateMany).toHaveBeenCalledTimes(1)
    const queuedAWrite = updateMany.mock.results[0]?.value as Promise<unknown>

    const configBCommit = storage.set('connectors', { rss: configB })
    view.rerender(
      <StorageProvider storage={storage}>
        <Probe config={configB} refresh={refresh} ttl={60_000} />
      </StorageProvider>,
    )
    await act(async () => {
      await tick()
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      releaseQueue.resolve()
      await priorUpdate
      await queuedAWrite
      await configBCommit
      await tick()
    })
    expect(refresh).toHaveBeenCalledTimes(2)

    const storedAfterA = (await storage.get('connectorSnapshots')).rss
    expect(storedAfterA?.data).not.toBe('account-a')

    await act(async () => {
      requestB.resolve('account-b')
      await tick()
    })
  })

  it('scope B wins when pending scope A resolves after B', async () => {
    const storage = await freshStorage()
    const requestA = deferred<string>()
    const requestB = deferred<string>()
    const refresh = vi
      .fn<(_: string | null) => Promise<string>>()
      .mockReturnValueOnce(requestA.promise)
      .mockReturnValueOnce(requestB.promise)
    const view = mount(storage, refresh, 60_000, configA)
    await act(async () => {
      await tick()
    })

    await storage.set('connectors', { rss: configB })
    view.rerender(
      <StorageProvider storage={storage}>
        <Probe config={configB} refresh={refresh} ttl={60_000} />
      </StorageProvider>,
    )
    await act(async () => {
      await tick()
      requestB.resolve('account-b')
      await tick()
      requestA.resolve('account-a')
      await tick()
    })

    expect(screen.queryByText('data:account-a')).toBeNull()
    expect(screen.getByText('data:account-b')).toBeTruthy()
    const stored = (await storage.get('connectorSnapshots')).rss
    expect(stored?.scope).toBe(await connectorSnapshotScope('rss', configB))
    expect(stored?.data).toBe('account-b')
  })

  it('runtime scope B wins when pending scope A resolves after B under the same config', async () => {
    const storage = await freshStorage()
    const requestA = deferred<string>()
    const requestB = deferred<string>()
    const refresh = vi
      .fn<(_: string | null) => Promise<string>>()
      .mockReturnValueOnce(requestA.promise)
      .mockReturnValueOnce(requestB.promise)
    const scopeA = { timeZone: 'America/New_York' }
    const scopeB = { timeZone: 'Europe/Berlin' }
    const view = mount(storage, refresh, 60_000, configA, scopeA)
    await act(async () => {
      await tick()
    })

    view.rerender(
      <StorageProvider storage={storage}>
        <Probe config={configA} refresh={refresh} ttl={60_000} runtimeScope={scopeB} />
      </StorageProvider>,
    )
    await act(async () => {
      await tick()
      requestB.resolve('berlin')
      await tick()
      requestA.resolve('new-york')
      await tick()
    })

    expect(screen.queryByText('data:new-york')).toBeNull()
    expect(screen.getByText('data:berlin')).toBeTruthy()
    const stored = (await storage.get('connectorSnapshots')).rss
    expect(stored?.scope).toBe(await connectorSnapshotScope('rss', configA, scopeB))
    expect(stored?.data).toBe('berlin')
  })

  it('treats a matching-scope malformed payload as absent and refreshes from null', async () => {
    const runtimeScope = { timeZone: 'America/New_York' }
    const storage = await freshStorage()
    await storage.set('connectorSnapshots', {
      rss: {
        scope: await connectorSnapshotScope('rss', configA, runtimeScope),
        fetchedAt: Date.now(),
        data: { malformed: true },
      },
    })
    const refresh = vi.fn((_prev: string | null) => Promise.resolve('valid'))
    const isData = (value: unknown): value is string => typeof value === 'string'

    mount(storage, refresh, 60_000, configA, runtimeScope, isData)
    await act(async () => {
      await tick()
    })

    expect(screen.queryByText(/malformed/)).toBeNull()
    expect(refresh).toHaveBeenCalledWith(null)
    expect(screen.getByText('data:valid')).toBeTruthy()
  })

  it('legacy unscoped cache is ignored and replaced', async () => {
    const storage = await freshStorage()
    await storage.set('connectorSnapshots', {
      rss: { fetchedAt: Date.now(), data: 'legacy' },
    })
    const refresh = vi.fn(() => Promise.resolve('current'))

    mount(storage, refresh, 60_000)
    await act(async () => {
      await tick()
    })

    expect(screen.queryByText('data:legacy')).toBeNull()
    await screen.findByText('data:current')
    const stored = (await storage.get('connectorSnapshots')).rss
    expect(stored?.scope).toBe(await connectorSnapshotScope('rss', configA))
  })

  it('TTL expiry refreshes an open visible tab exactly once', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T12:00:00Z'))
    const storage = await freshStorage(configA, {
      fetchedAt: Date.now(),
      data: 'cached',
    })
    const refresh = vi.fn(() => Promise.resolve('fresh'))

    mount(storage, refresh, 5_000)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(refresh).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByText('data:fresh')).toBeTruthy()
  })

  it('visibility and focus recheck staleness without overlapping the timer request', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T12:00:00Z'))
    const storage = await freshStorage(configA, {
      fetchedAt: Date.now(),
      data: 'cached',
    })
    const pending = deferred<string>()
    const refresh = vi.fn(() => pending.promise)

    mount(storage, refresh, 1_000)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(1_000)
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve('fresh')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('rejected refresh keeps matching stale data and later success clears lastError', async () => {
    const storage = await freshStorage(configA, {
      fetchedAt: Date.now() - 70_000,
      data: 'stale-data',
    })
    const refresh = vi
      .fn<(_: string | null) => Promise<string>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce('fresh-data')

    mount(storage, refresh, 60_000)
    await screen.findByText('error:network down')
    expect(screen.getByText('data:stale-data')).toBeTruthy()

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await tick()
    })

    await screen.findByText('data:fresh-data')
    expect(screen.getByText('error:null')).toBeTruthy()
  })

  it('failed TTL refresh schedules one bounded retry and unmount cancels it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T12:00:00Z'))
    const storage = await freshStorage(configA, {
      fetchedAt: Date.now(),
      data: 'cached',
    })
    const refresh = vi.fn(() => Promise.reject(new Error('offline')))
    const view = mount(storage, refresh, 10)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999)
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(refresh).toHaveBeenCalledTimes(2)

    view.unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('post-unmount focus and visibility events cannot read or refresh', async () => {
    const storage = await freshStorage(configA, {
      fetchedAt: Date.now(),
      data: 'cached',
    })
    const get = vi.spyOn(storage, 'get')
    const refresh = vi.fn(() => Promise.resolve('fresh'))
    const view = mount(storage, refresh, 60_000)
    await act(async () => {
      await tick()
    })
    get.mockClear()

    view.unmount()
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    await tick()

    expect(get).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
