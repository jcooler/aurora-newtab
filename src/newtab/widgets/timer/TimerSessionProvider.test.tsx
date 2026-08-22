// @vitest-environment jsdom
import { act, render, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInProcessStorageAuthority } from '../../../lib/storage/authority'
import { StorageProvider } from '../../../lib/storage/context'
import { memoryDriver } from '../../../lib/storage/driver'
import { createStorage } from '../../../lib/storage/index'
import { defaults, type TimerSession } from '../../../lib/storage/schema'
import {
  TimerSessionProvider,
  useTimerSession,
} from './TimerSessionProvider'

const MIN = 60_000

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

  it('receives another context update and exposes it without a reload', async () => {
    const { result, otherContext } = await harness()
    const external = session({ mode: 'break', remainingMs: 2 * MIN, cycles: 3, flow: true })

    await act(async () => { await otherContext.set('timerSession', external) })

    await waitFor(() => expect(result.current.session).toEqual(external))
  })

  it('owns one clock even when multiple descendants consume the controller', async () => {
    const driver = memoryDriver({ ...defaults(), 'aurora:version': 15 })
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
})
