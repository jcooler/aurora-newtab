// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocalDay } from './useLocalDay'

const runtime = vi.hoisted(() => ({ zone: 'America/New_York' }))
vi.mock('../dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dates')>()
  return { ...actual, resolvedLocalTimeZone: () => runtime.zone }
})

function setVisible(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true })
}

describe('useLocalDay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    runtime.zone = 'America/New_York'
    setVisible('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('publishes the next constructed midnight exactly across a 23-hour New York day', () => {
    vi.setSystemTime(Date.UTC(2026, 2, 9, 3, 59, 59, 900))
    const { result, unmount } = renderHook(() => useLocalDay())
    expect(result.current).toMatchObject({ key: '2026-03-08', timeZone: 'America/New_York' })

    act(() => vi.advanceTimersByTime(99))
    expect(result.current.key).toBe('2026-03-08')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toMatchObject({ key: '2026-03-09', timeZone: 'America/New_York' })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not enter a one-millisecond loop before a midnight DST jump', () => {
    runtime.zone = 'America/Havana'
    vi.setSystemTime(Date.UTC(2026, 2, 8, 4, 30))
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    const { result } = renderHook(() => useLocalDay())

    expect(result.current.key).toBe('2026-03-07')
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 60_000)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('detects a timezone change even when the local date key is unchanged', () => {
    vi.setSystemTime(Date.UTC(2026, 5, 1, 12))
    const { result } = renderHook(() => useLocalDay())
    expect(result.current).toMatchObject({ key: '2026-06-01', timeZone: 'America/New_York' })

    runtime.zone = 'Europe/Berlin'
    act(() => vi.advanceTimersToNextTimer())
    expect(result.current).toMatchObject({ key: '2026-06-01', timeZone: 'Europe/Berlin' })
    expect(vi.getTimerCount()).toBe(1)
  })

  it.each([
    ['visibilitychange', () => document.dispatchEvent(new Event('visibilitychange'))],
    ['focus', () => window.dispatchEvent(new Event('focus'))],
    ['pageshow', () => window.dispatchEvent(new Event('pageshow'))],
  ])('resamples immediately after a sleeping tab receives %s', (_name, restore) => {
    vi.setSystemTime(Date.UTC(2026, 5, 1, 16))
    const { result } = renderHook(() => useLocalDay())
    expect(result.current.key).toBe('2026-06-01')

    vi.setSystemTime(Date.UTC(2026, 5, 2, 16))
    act(restore)
    expect(result.current.key).toBe('2026-06-02')
    expect(vi.getTimerCount()).toBe(1)
  })

  it('ignores a callback from an invalidated schedule', () => {
    vi.setSystemTime(Date.UTC(2026, 5, 1, 16))
    const callbacks: Array<() => void> = []
    const nativeSetTimeout = window.setTimeout.bind(window)
    vi.spyOn(window, 'setTimeout').mockImplementation(((callback: TimerHandler, delay?: number) => {
      if (typeof callback === 'function') callbacks.push(callback as () => void)
      return nativeSetTimeout(callback, delay)
    }) as typeof window.setTimeout)
    const { result } = renderHook(() => useLocalDay())
    const stale = callbacks[0]!

    act(() => window.dispatchEvent(new Event('focus')))
    runtime.zone = 'Europe/Berlin'
    act(stale)
    expect(result.current.timeZone).toBe('America/New_York')
  })

  it('leaves one live schedule through Strict Mode and cleans listeners/timers on unmount', () => {
    vi.setSystemTime(Date.UTC(2026, 5, 1, 16))
    const addDocument = vi.spyOn(document, 'addEventListener')
    const removeDocument = vi.spyOn(document, 'removeEventListener')
    const addWindow = vi.spyOn(window, 'addEventListener')
    const removeWindow = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useLocalDay(), { wrapper: StrictMode })
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(removeDocument.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(
      addDocument.mock.calls.filter(([type]) => type === 'visibilitychange').length,
    )
    for (const type of ['focus', 'pageshow']) {
      expect(removeWindow.mock.calls.filter(([event]) => event === type)).toHaveLength(
        addWindow.mock.calls.filter(([event]) => event === type).length,
      )
    }
  })
})
