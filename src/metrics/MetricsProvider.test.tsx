// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider } from '../account/AccountContext'
import type { AccountClient } from '../account/client'
import { localAccountClient } from '../account/localAccountClient'
import type { AccountSnapshot, PremiumCapability } from '../account/types'
import { createInProcessStorageAuthority } from '../lib/storage/authority'
import { StorageProvider } from '../lib/storage/context'
import { memoryDriver } from '../lib/storage/driver'
import { createStorage } from '../lib/storage/index'
import { CURRENT_VERSION, defaults } from '../lib/storage/schema'
import { emptyMetricsHistory } from './history'
import { MetricsProvider, useMetrics } from './MetricsProvider'

const NOW = new Date(2026, 8, 2, 12).getTime()
const INSTALLATION_ID = '00000000-0000-4000-8000-000000000001'

function ids() {
  let value = 1
  return () => `00000000-0000-4000-8000-${(++value).toString().padStart(12, '0')}`
}

function snapshot({
  mode = 'signed_in',
  capabilities = ['metrics_history'],
  expiresAt = NOW + 60_000,
}: {
  mode?: 'local' | 'signed_in'
  capabilities?: PremiumCapability[]
  expiresAt?: number
} = {}): AccountSnapshot {
  const signedIn = mode === 'signed_in'
  return {
    mode,
    accountId: signedIn ? 'account-1' : null,
    email: signedIn ? 'alex@example.com' : null,
    displayName: signedIn ? 'Alex' : null,
    billing: {
      state: signedIn ? 'active' : 'none',
      plan: signedIn ? 'annual' : null,
      currentPeriodEnd: null,
      courtesyEnd: null,
      cancelAtPeriodEnd: false,
      introductoryEligible: false,
    },
    lease: signedIn ? {
      verification: 'verified',
      leaseVersion: 1,
      keyId: 'key-1',
      accountId: 'account-1',
      capabilities,
      grantSources: ['complimentary_owner'],
      issuedAt: NOW - 60_000,
      expiresAt,
      leaseId: 'lease-1',
    } : null,
    sync: {
      enabled: false,
      phase: 'disabled',
      lastSuccessAt: null,
      usedBytes: 0,
      quotaBytes: 2_097_152,
    },
    devices: [],
  }
}

function client(initial: AccountSnapshot): AccountClient {
  return {
    getSnapshot: vi.fn(async () => initial),
    subscribe: vi.fn(() => () => {}),
    actions: localAccountClient.actions,
    syncGateway: null,
  }
}

async function harness(account: AccountSnapshot, seed: Partial<ReturnType<typeof defaults>> = {}) {
  const driver = memoryDriver({ ...defaults(), ...seed, 'aurora:version': CURRENT_VERSION })
  const storage = createStorage(driver, createInProcessStorageAuthority())
  await storage.init()
  const update = vi.spyOn(storage, 'update')
  const createId = ids()
  const hook = renderHook(() => useMetrics(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <StorageProvider storage={storage}>
        <AccountProvider client={client(account)}>
          <MetricsProvider createId={createId} installationId={INSTALLATION_ID}>
            {children}
          </MetricsProvider>
        </AccountProvider>
      </StorageProvider>
    ),
  })
  return { ...hook, storage, update }
}

async function settle() {
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

describe('MetricsProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([
    ['local mode', snapshot({ mode: 'local' })],
    ['missing capability', snapshot({ capabilities: [] })],
    ['expired lease', snapshot({ expiresAt: NOW })],
  ])('never collects in %s', async (_label, account) => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const { result, storage, update } = await harness(account, {
      habits: [{ id: 'private-id', name: 'Private habit', createdAt: NOW, log: ['2026-09-02'] }],
    })

    await settle()

    expect(result.current.entitled).toBe(false)
    expect(await storage.get('metricsHistory')).toBeNull()
    expect(update.mock.calls.filter(([key]) => key === 'metricsHistory')).toHaveLength(0)
    expect(update).not.toHaveBeenCalled()
  })

  it('bootstraps one installation, derives aggregate-only buckets, and makes no request', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const request = vi.spyOn(globalThis, 'fetch')
    const { result, update } = await harness(snapshot(), {
      habits: [{ id: 'private-id', name: 'Private habit', createdAt: NOW, log: ['2026-09-02'] }],
    })

    await settle()
    expect(result.current.history?.buckets).toHaveLength(1)

    expect(result.current.entitled).toBe(true)
    expect(result.current.history?.installationId).toBe(INSTALLATION_ID)
    expect(JSON.stringify(result.current.history)).not.toMatch(/Private habit|private-id/u)
    expect(result.current.history?.buckets[0]).toMatchObject({
      date: '2026-09-02',
      source: 'habits',
      sourceInstanceId: 'local-habits',
      installationId: INSTALLATION_ID,
      sequence: 1,
      values: { kind: 'habits', completed: 1, tracked: 1, streak: 1 },
    })
    expect(update.mock.calls.filter(([key]) => key === 'metricsHistory')).toHaveLength(1)
    expect(request).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('coalesces a burst of subscribed source changes into one collection write', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const { storage, update } = await harness(snapshot())
    await settle()
    update.mockClear()

    await act(async () => {
      await Promise.all([
        storage.set('habits', [{ id: 'h1', name: 'A', createdAt: NOW, log: ['2026-09-02'] }]),
        storage.set('todoLists', []),
      ])
    })
    await settle()

    expect(update.mock.calls.filter(([key]) => key === 'metricsHistory')).toHaveLength(1)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('stops collection when the verified lease expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const { result, storage, update } = await harness(snapshot({ expiresAt: NOW + 1_000 }))
    await settle()
    update.mockClear()

    await act(async () => { await vi.advanceTimersByTimeAsync(1_001) })
    expect(result.current.entitled).toBe(false)
    await act(async () => {
      await storage.set('habits', [{ id: 'h1', name: 'A', createdAt: NOW, log: ['2026-09-02'] }])
    })
    await settle()

    expect(update.mock.calls.filter(([key]) => key === 'metricsHistory')).toHaveLength(0)
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps existing history readable, exportable, and deletable without entitlement', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const existing = emptyMetricsHistory(INSTALLATION_ID)
    const { result, storage } = await harness(snapshot({ capabilities: [] }), { metricsHistory: existing })
    await settle()
    expect(result.current.hydrated).toBe(true)

    expect(result.current.history).toEqual(existing)
    expect(result.current.exportMetricsHistory('2026-09-02T16:00:00.000Z')).toContain('"kind": "metrics-history"')

    await act(async () => { await result.current.deleteMetricsHistory() })
    expect(await storage.get('metricsHistory')).toBeNull()
    expect(result.current.history).toBeNull()
  })
})
