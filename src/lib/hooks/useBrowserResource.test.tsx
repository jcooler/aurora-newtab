// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBrowserResource, __resetBrowserResourceForTests } from './useBrowserResource'
import { hasPermission, subscribePermission } from '../../services/permissions'

vi.mock('../../services/permissions', () => ({
  hasPermission: vi.fn(),
  subscribePermission: vi.fn(),
}))

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
  identity = 'readingList',
  load,
  subscribe = () => () => undefined,
  retryDelayMs = 100,
}: {
  identity?: string
  load: () => Promise<string[]>
  subscribe?: (listener: () => void) => () => void
  retryDelayMs?: number
}) {
  const resource = useBrowserResource({
    identity,
    permission: 'readingList',
    load,
    subscribe,
    retryDelayMs,
  })
  return (
    <div>
      <p>{resource.state.status}</p>
      <p>{'data:' + ('data' in resource.state && resource.state.data ? resource.state.data.join(',') : 'none')}</p>
      <button onClick={() => void resource.refresh()}>Refresh</button>
    </div>
  )
}

beforeEach(() => {
  __resetBrowserResourceForTests()
  vi.mocked(hasPermission).mockReset().mockResolvedValue(true)
  vi.mocked(subscribePermission).mockReset().mockReturnValue(() => undefined)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

afterEach(() => {
  __resetBrowserResourceForTests()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useBrowserResource', () => {
  it('reports permission-required without touching the feature API', async () => {
    vi.mocked(hasPermission).mockResolvedValue(false)
    const load = vi.fn().mockResolvedValue(['forbidden'])
    render(<Probe load={load} />)
    expect(await screen.findByText('permission-required')).toBeTruthy()
    expect(load).not.toHaveBeenCalled()
  })

  it('deduplicates one in-flight query per identity across mounted consumers', async () => {
    const pending = deferred<string[]>()
    const load = vi.fn(() => pending.promise)
    render(<><Probe load={load} /><Probe load={load} /></>)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(load).toHaveBeenCalledTimes(1)
    await act(async () => { pending.resolve(['one']); await pending.promise })
    expect(screen.getAllByText('data:one')).toHaveLength(2)
  })

  it('ignores a stale completion after unmount', async () => {
    const pending = deferred<string[]>()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = render(<Probe load={() => pending.promise} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    view.unmount()
    await act(async () => { pending.resolve(['late']); await pending.promise })
    expect(error).not.toHaveBeenCalled()
  })

  it('refreshes on a feature event and when the document becomes visible', async () => {
    let apiListener: (() => void) | null = null
    const subscribe = vi.fn((listener: () => void) => {
      apiListener = listener
      return vi.fn()
    })
    const load = vi.fn()
      .mockResolvedValueOnce(['one'])
      .mockResolvedValueOnce(['two'])
      .mockResolvedValueOnce(['three'])
    render(<Probe load={load} subscribe={subscribe} />)
    expect(await screen.findByText('data:one')).toBeTruthy()
    await act(async () => { apiListener?.(); await Promise.resolve(); await Promise.resolve() })
    expect(await screen.findByText('data:two')).toBeTruthy()
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve(); await Promise.resolve()
    })
    expect(await screen.findByText('data:three')).toBeTruthy()
  })

  it('retains useful in-memory data on error and permits manual recovery', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(['cached'])
      .mockRejectedValueOnce(new Error('Reading List unavailable'))
      .mockResolvedValueOnce(['recovered'])
    render(<Probe load={load} retryDelayMs={60_000} />)
    expect(await screen.findByText('data:cached')).toBeTruthy()
    await act(async () => { screen.getByRole('button', { name: 'Refresh' }).click() })
    expect(await screen.findByText('error')).toBeTruthy()
    expect(screen.getByText('data:cached')).toBeTruthy()
    await act(async () => { screen.getByRole('button', { name: 'Refresh' }).click() })
    expect(await screen.findByText('data:recovered')).toBeTruthy()
  })

  it('returns to permission-required on revocation and fences the pending result', async () => {
    let permissionListener: ((held: boolean) => void) | null = null
    vi.mocked(subscribePermission).mockImplementation((_permission, listener) => {
      permissionListener = listener
      return () => undefined
    })
    const pending = deferred<string[]>()
    render(<Probe load={() => pending.promise} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { permissionListener?.(false) })
    expect(screen.getByText('permission-required')).toBeTruthy()
    await act(async () => { pending.resolve(['must-not-paint']); await pending.promise })
    expect(screen.getByText('data:none')).toBeTruthy()
  })

  it('performs at most one automatic retry and cleans every listener on unmount', async () => {
    vi.useFakeTimers()
    const cleanupApi = vi.fn()
    const cleanupPermission = vi.fn()
    const subscribe = vi.fn(() => cleanupApi)
    vi.mocked(subscribePermission).mockReturnValue(cleanupPermission)
    const load = vi.fn().mockRejectedValue(new Error('offline'))
    const view = render(<Probe load={load} subscribe={subscribe} retryDelayMs={100} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(load).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(cleanupApi).toHaveBeenCalledTimes(1)
    expect(cleanupPermission).toHaveBeenCalledTimes(1)
  })
})
