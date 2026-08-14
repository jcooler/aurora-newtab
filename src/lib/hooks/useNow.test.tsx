// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNow } from './useNow'

describe('useNow restoration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([
    ['visibilitychange', () => document.dispatchEvent(new Event('visibilitychange'))],
    ['focus', () => window.dispatchEvent(new Event('focus'))],
    ['pageshow', () => window.dispatchEvent(new Event('pageshow'))],
  ])('samples the wall clock immediately on %s while retaining one interval', (_name, restore) => {
    vi.setSystemTime(Date.UTC(2026, 5, 1, 12))
    const { result, unmount } = renderHook(() => useNow(500))
    expect(result.current.getTime()).toBe(Date.UTC(2026, 5, 1, 12))

    vi.setSystemTime(Date.UTC(2026, 5, 1, 12, 2))
    act(restore)
    expect(result.current.getTime()).toBe(Date.UTC(2026, 5, 1, 12, 2))
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not resample while visibility remains hidden', () => {
    vi.setSystemTime(Date.UTC(2026, 5, 1, 12))
    const { result } = renderHook(() => useNow(500))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    vi.setSystemTime(Date.UTC(2026, 5, 1, 12, 2))
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(result.current.getTime()).toBe(Date.UTC(2026, 5, 1, 12))
  })
})
