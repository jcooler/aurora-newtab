// @vitest-environment jsdom
import { act, render, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider } from '../../../account/AccountContext'
import type { AccountClient } from '../../../account/client'
import { localAccountClient } from '../../../account/localAccountClient'
import type { AccountSnapshot } from '../../../account/types'
import { createInProcessStorageAuthority } from '../../../lib/storage/authority'
import { StorageProvider } from '../../../lib/storage/context'
import { memoryDriver } from '../../../lib/storage/driver'
import { createStorage } from '../../../lib/storage/index'
import { defaults, type TimerSession } from '../../../lib/storage/schema'
import { MetricsProvider } from '../../../metrics/MetricsProvider'
import {
  TimerSessionProvider,
  useTimerFlowState,
  useTimerSession,
} from './TimerSessionProvider'

const MIN = 60_000
const METRICS_NOW = new Date(2026, 8, 2, 12).getTime()
const INSTALLATION_ID = '00000000-0000-4000-8000-000000000001'

function session(overrides: Partial<TimerSession> = {}): TimerSession {
  return {
    mode: 'work',
    running: false,
    endsAt: null,
    remainingMs: 25 * MIN,
    cycles: 0,
    flow: false,
    ...overrides,
  }
}

async function harness(seed: TimerSession | null = null) {
  const driver = memoryDriver({ ...defaults(), timerSession: seed, 'aurora:version': 15 })
  const authority = createInProcessStorageAuthority()
  const storage = createStorage(driver, authority)
  const otherContext = createStorage(driver, authority)
  await storage.init()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StorageProvider storage={storage}>
      <TimerSessionProvider>{children}</TimerSessionProvider>
    </StorageProvider>
  )
  const hook = renderHook(() => useTimerSession(), { wrapper })
  await act(async () => {})
  expect(hook.result.current.hydrated).toBe(true)
  return { ...hook, storage, otherContext }
}

function accountSnapshot(entitled = true): AccountSnapshot {
  return {
    mode: 'signed_in',
    accountId: 'account-1',
    email: 'alex@example.com',
    displayName: 'Alex',
    billing: {
      state: 'active', plan: 'annual', currentPeriodEnd: null, courtesyEnd: null,
      cancelAtPeriodEnd: false, introductoryEligible: false,
    },
    lease: {
      verification: 'verified', leaseVersion: 1, keyId: 'key-1', accountId: 'account-1',
      capabilities: entitled ? ['metrics_history'] : [],
      grantSources: ['complimentary_owner'], issuedAt: METRICS_NOW - MIN,
      expiresAt: METRICS_NOW + 24 * 60 * MIN, leaseId: 'lease-1',
    },
    sync: {
      enabled: false, phase: 'disabled', lastSuccessAt: null, usedBytes: 0, quotaBytes: 2_097_152,
    },
    devices: [],
  }
}

function accountClient(entitled = true): AccountClient {
  return {
    getSnapshot: vi.fn(async () => accountSnapshot(entitled)),
    subscribe: vi.fn(() => () => {}),
    actions: localAccountClient.actions,
    syncGateway: null,
  }
}

function idFactory() {
  let value = 1
  return () => `00000000-0000-4000-8000-${(++value).toString().padStart(12, '0')}`
}

async function metricsHarness(seed: TimerSession, entitled = true) {
  const driver = memoryDriver({ ...defaults(), timerSession: seed, 'aurora:version': 21 })
  const storage = createStorage(driver, createInProcessStorageAuthority())
  await storage.init()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StorageProvider storage={storage}>
      <AccountProvider client={accountClient(entitled)}>
        <MetricsProvider createId={idFactory()} installationId={INSTALLATION_ID}>
          <TimerSessionProvider>{children}</TimerSessionProvider>
        </MetricsProvider>
      </AccountProvider>
    </StorageProvider>
  )
  const hook = renderHook(() => useTimerSession(), { wrapper })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  expect(hook.result.current.hydrated).toBe(true)
  return { ...hook, storage }
}

describe('TimerSessionProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('hydrates null as idle without writing it back', async () => {
    const driver = memoryDriver({ ...defaults(), timerSession: null, 'aurora:version': 15 })
    const storage = createStorage(driver)
    await storage.init()
    const update = vi.spyOn(storage, 'update')
    const updateMany = vi.spyOn(storage, 'updateMany')
    const { result } = renderHook(() => useTimerSession(), {
      wrapper: ({ children }) => (
        <StorageProvider storage={storage}>
          <TimerSessionProvider>{children}</TimerSessionProvider>
        </StorageProvider>
      ),
    })

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.session).toMatchObject({ mode: 'work', running: false, flow: false })
    expect(result.current.remainingMs).toBe(25 * MIN)
    expect(update).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('derives countdown ticks locally without per-tick storage writes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const active = session({ running: true, endsAt: 10 * MIN })
    const { result, storage } = await harness(active)
    const update = vi.spyOn(storage, 'update')
    const updateMany = vi.spyOn(storage, 'updateMany')

    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })

    expect(result.current.remainingMs).toBe(10 * MIN - 1_500)
    expect(update).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('writes exactly once when an absolute deadline crosses and reports the completed phase', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const active = session({ running: true, endsAt: 1_000, remainingMs: 1_000 })
    const { result, storage } = await harness(active)
    const updateMany = vi.spyOn(storage, 'updateMany')

    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })
    expect(updateMany).toHaveBeenCalledTimes(1)

    expect(await storage.get('timerSession')).toEqual(session({
      mode: 'break',
      running: true,
      endsAt: 1_500 + 5 * MIN,
      remainingMs: 5 * MIN,
      cycles: 1,
    }))
    expect(result.current.justFinished).toBe('work')
  })

  it('atomically records one entitled Focus aggregate when a work deadline crosses', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(METRICS_NOW)
    const active = session({ running: true, endsAt: METRICS_NOW + 1_000, remainingMs: 1_000 })
    const { result, storage } = await metricsHarness(active)
    const updateMany = vi.spyOn(storage, 'updateMany')

    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })

    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(updateMany.mock.calls[0]?.[0]).toEqual(['timerSession', 'timerConfig', 'metricsHistory'])
    expect(result.current.justFinished).toBe('work')
    expect((await storage.get('metricsHistory'))?.buckets).toHaveLength(1)
    expect((await storage.get('metricsHistory'))?.buckets[0]).toMatchObject({
      date: '2026-09-02',
      source: 'focus',
      sourceInstanceId: INSTALLATION_ID,
      values: { kind: 'focus', sessions: 1, minutes: 25 },
    })
  })

  it('waits for account and metrics ownership hydration before resolving an overdue work phase', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(METRICS_NOW)
    const overdue = session({ running: true, endsAt: METRICS_NOW - 1_000, remainingMs: 1_000 })
    const { storage } = await metricsHarness(overdue)

    expect((await storage.get('metricsHistory'))?.buckets[0]).toMatchObject({
      date: '2026-09-02',
      source: 'focus',
      values: { kind: 'focus', sessions: 1, minutes: 25 },
    })
    expect((await storage.get('timerSession'))?.mode).toBe('break')
  })

  it('does not count break completion, reset, or inactive entitlement', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(METRICS_NOW)

    const breakRun = await metricsHarness(session({
      mode: 'break', running: true, endsAt: METRICS_NOW + 1_000, remainingMs: 1_000,
    }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })
    expect((await breakRun.storage.get('metricsHistory'))?.buckets).toEqual([])
    breakRun.unmount()

    vi.setSystemTime(METRICS_NOW)
    const resetRun = await metricsHarness(session({
      running: true, endsAt: METRICS_NOW + 1_000, remainingMs: 1_000,
    }))
    await act(async () => { await resetRun.result.current.reset() })
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })
    expect((await resetRun.storage.get('metricsHistory'))?.buckets).toEqual([])
    resetRun.unmount()

    vi.setSystemTime(METRICS_NOW)
    const inactive = await metricsHarness(session({
      running: true, endsAt: METRICS_NOW + 1_000, remainingMs: 1_000,
    }), false)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })
    expect(await inactive.storage.get('metricsHistory')).toBeNull()
  })

  it('deduplicates simultaneous timer owners through the locked transition', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(METRICS_NOW)
    const driver = memoryDriver({
      ...defaults(),
      timerSession: session({ running: true, endsAt: METRICS_NOW + 1_000, remainingMs: 1_000 }),
      'aurora:version': 21,
    })
    const storage = createStorage(driver, createInProcessStorageAuthority())
    await storage.init()
    const view = render(
      <StorageProvider storage={storage}>
        <AccountProvider client={accountClient()}>
          <MetricsProvider createId={idFactory()} installationId={INSTALLATION_ID}>
            <TimerSessionProvider><span>one</span></TimerSessionProvider>
            <TimerSessionProvider><span>two</span></TimerSessionProvider>
          </MetricsProvider>
        </AccountProvider>
      </StorageProvider>,
    )
    await act(async () => { await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })

    expect((await storage.get('metricsHistory'))?.buckets[0]?.values).toEqual({
      kind: 'focus', sessions: 1, minutes: 25,
    })
    view.unmount()
  })

  it('commits no Focus aggregate when the atomic timer write fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(METRICS_NOW)
    const active = session({ running: true, endsAt: METRICS_NOW + 1_000, remainingMs: 1_000 })
    const { storage } = await metricsHarness(active)
    vi.spyOn(storage, 'updateMany').mockRejectedValueOnce(new Error('atomic write failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })

    expect(await storage.get('timerSession')).toEqual(active)
    expect((await storage.get('metricsHistory'))?.buckets).toEqual([])
    expect(consoleError).toHaveBeenCalledWith('[tab-two] timer phase transition failed')
  })

  it('applies actions through a serialized read of the freshest stored session', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(20 * MIN)
    const { result, storage, otherContext } = await harness(session({ remainingMs: 15 * MIN }))
    await act(async () => {
      await otherContext.set('timerSession', session({ remainingMs: 3 * MIN, cycles: 4 }))
    })

    await act(async () => { await result.current.start() })

    expect(await storage.get('timerSession')).toEqual(session({
      running: true,
      endsAt: 23 * MIN,
      remainingMs: 3 * MIN,
      cycles: 4,
    }))
  })

  it('reduces an action against the freshest locked config before its React subscription commits', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(20 * MIN)
    const { result, storage, otherContext } = await harness(session({ remainingMs: 25 * MIN }))

    await act(async () => {
      await otherContext.set('timerConfig', { workMinutes: 50, breakMinutes: 7 })
      await result.current.reset()
      await result.current.start()
    })

    expect(await storage.get('timerSession')).toEqual(session({
      running: true,
      endsAt: 70 * MIN,
      remainingMs: 50 * MIN,
    }))
  })

  it('receives another context update and exposes it without a reload', async () => {
    const { result, otherContext } = await harness()
    const external = session({ mode: 'break', remainingMs: 2 * MIN, cycles: 3, flow: true })

    await act(async () => { await otherContext.set('timerSession', external) })

    await waitFor(() => expect(result.current.session).toEqual(external))
  })

  it('owns one clock even when multiple descendants consume a running controller', async () => {
    const driver = memoryDriver({
      ...defaults(),
      timerSession: session({ running: true, endsAt: Date.now() + 10 * MIN }),
      'aurora:version': 15,
    })
    const storage = createStorage(driver)
    await storage.init()
    const intervalSpy = vi.spyOn(window, 'setInterval')
    function Consumer() {
      useTimerSession()
      return null
    }

    render(
      <StorageProvider storage={storage}>
        <TimerSessionProvider>
          <Consumer />
          <Consumer />
        </TimerSessionProvider>
      </StorageProvider>,
    )
    await act(async () => {})
    expect(intervalSpy).toHaveBeenCalledTimes(1)
  })

  it('owns no idle clock and does not invalidate stable Flow consumers on running ticks', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const driver = memoryDriver({ ...defaults(), 'aurora:version': 15 })
    const storage = createStorage(driver)
    await storage.init()
    let flowRenders = 0
    function FlowConsumer() {
      useTimerFlowState()
      flowRenders++
      return null
    }
    const view = render(
      <StorageProvider storage={storage}>
        <TimerSessionProvider><FlowConsumer /></TimerSessionProvider>
      </StorageProvider>,
    )
    await act(async () => {})
    expect(vi.getTimerCount()).toBe(0)

    await act(async () => {
      await storage.set('timerSession', session({ running: true, endsAt: 10 * MIN }))
    })
    const rendersAfterStart = flowRenders
    expect(vi.getTimerCount()).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })
    expect(flowRenders).toBe(rendersAfterStart)
    view.unmount()
  })
})
