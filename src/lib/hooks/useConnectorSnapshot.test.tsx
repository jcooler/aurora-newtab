// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../storage/index'
import { memoryDriver } from '../storage/driver'
import { StorageProvider } from '../storage/context'
import { useConnectorSnapshot, __resetInFlight } from './useConnectorSnapshot'

// The in-flight dedupe map is module-level and survives across cases; reset it
// so one test's pending refresh can't dedupe the next.
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function Probe({ refresh, ttl }: { refresh: () => Promise<string>; ttl?: number }) {
  const { data, fetchedAt, refreshing, lastError } = useConnectorSnapshot('rss', refresh, ttl)
  return (
    <ul>
      <li>{'data:' + (data ?? 'none')}</li>
      <li>{'fetchedAt:' + (fetchedAt ?? 'null')}</li>
      <li>{'refreshing:' + refreshing}</li>
      <li>{'error:' + (lastError ?? 'null')}</li>
    </ul>
  )
}

async function freshStorage(seed?: { fetchedAt: number; data: unknown }): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  if (seed) await storage.set('connectorSnapshots', { rss: seed })
  return storage
}

function mount(storage: AuroraStorage, refresh: () => Promise<string>, ttl?: number) {
  return render(
    <StorageProvider storage={storage}>
      <Probe refresh={refresh} ttl={ttl} />
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
    expect(stored?.data).toBe('fresh-data')
    expect(typeof stored?.fetchedAt).toBe('number')
    expect(stored?.fetchedAt).toBeGreaterThan(0)
  })

  it('stale snapshot: cached data is returned IMMEDIATELY, then refresh follows and updates it', async () => {
    const storage = await freshStorage({ fetchedAt: Date.now() - 10_000, data: 'stale-data' })
    let resolveRefresh!: (v: string) => void
    const refresh = vi.fn(() => new Promise<string>((r) => (resolveRefresh = r)))

    // ttl 1s, snapshot is 10s old -> stale.
    mount(storage, refresh, 1_000)

    // Cached value must be visible before the refresh promise resolves.
    await screen.findByText('data:stale-data')
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveRefresh('fresh-data')
      await tick()
    })
    await screen.findByText('data:fresh-data')
  })

  it('fresh-enough snapshot: no refresh', async () => {
    const storage = await freshStorage({ fetchedAt: Date.now(), data: 'cached' })
    const refresh = vi.fn(() => Promise.resolve('should-not-run'))

    // ttl 60s, snapshot just written -> fresh.
    mount(storage, refresh, 60_000)
    await act(async () => {
      await tick()
    })

    await screen.findByText('data:cached')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refresh rejection: stale data kept, lastError set, nothing written', async () => {
    const staleAt = Date.now() - 10_000
    const storage = await freshStorage({ fetchedAt: staleAt, data: 'stale-data' })
    const refresh = vi.fn(() => Promise.reject(new Error('network down')))

    mount(storage, refresh, 1_000)
    await act(async () => {
      await tick()
    })

    await screen.findByText('data:stale-data')
    await screen.findByText('error:network down')
    // The cache in storage is untouched by a failed refresh.
    const stored = (await storage.get('connectorSnapshots')).rss
    expect(stored?.fetchedAt).toBe(staleAt)
    expect(stored?.data).toBe('stale-data')
  })

  it('two mounted consumers: exactly one refresh (in-flight dedupe)', async () => {
    const storage = await freshStorage()
    const refresh = vi.fn(() => Promise.resolve('shared'))

    render(
      <StorageProvider storage={storage}>
        <Probe refresh={refresh} />
        <Probe refresh={refresh} />
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
      rerender = () => setN((v) => v + 1)
      return <Probe refresh={refresh} />
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
})
