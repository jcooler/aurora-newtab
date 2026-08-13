// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../storage/index'
import { memoryDriver } from '../storage/driver'
import { StorageProvider } from '../storage/context'
import type { RssConfig } from '../../services/connectors/types'
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
}: {
  config: RssConfig
  refresh: (prev: string | null) => Promise<string>
  ttl?: number
}) {
  const { data, fetchedAt, refreshing, lastError } = useConnectorSnapshot(
    'rss',
    config,
    refresh,
    ttl,
  )
  return (
    <ul>
      <li>{'data:' + (data ?? 'none')}</li>
      <li>{'fetchedAt:' + (fetchedAt ?? 'null')}</li>
      <li>{'refreshing:' + refreshing}</li>
      <li>{'error:' + (lastError ?? 'null')}</li>
    </ul>
  )
}

async function freshStorage(
  config: RssConfig = configA,
  seed?: { fetchedAt: number; data: unknown },
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
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
) {
  return render(
    <StorageProvider storage={storage}>
      <Probe config={config} refresh={refresh} ttl={ttl} />
    </StorageProvider>,
  )
}

describe('useConnectorSnapshot', () => {
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
    const storage = await freshStorage(configA, { fetchedAt: Date.now(), data: 'cached' })
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
    const storage = await freshStorage(configA, { fetchedAt: Date.now(), data: 'account-a' })
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
    const storage = await freshStorage(configA, { fetchedAt: Date.now(), data: 'account-a' })
    const pending = deferred<string>()
    const refresh = vi.fn(() => pending.promise)
    const view = mount(storage, refresh, 60_000, configA)
    await screen.findByText('data:account-a')

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
    const storage = await freshStorage(configA, { fetchedAt: Date.now(), data: 'cached' })
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
    const storage = await freshStorage(configA, { fetchedAt: Date.now(), data: 'cached' })
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
    const storage = await freshStorage(configA, { fetchedAt: Date.now(), data: 'cached' })
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
    const storage = await freshStorage(configA, { fetchedAt: Date.now(), data: 'cached' })
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
