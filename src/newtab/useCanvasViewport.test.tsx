// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { selectCanvasProfile, useCanvasViewport } from './useCanvasViewport'

describe('Canvas viewport ownership', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('data-stage-profile')
    document.documentElement.removeAttribute('data-stage-density')
    document.documentElement.removeAttribute('style')
  })

  it.each([
    [899, 900, 'compact'],
    [900, 699, 'compact'],
    [900, 700, 'standard'],
    [1599, 700, 'standard'],
    [1600, 762, 'standard'],
    [1600, 761, 'ultrawide'],
    [2199, 1100, 'standard'],
    [2200, 1099, 'standard'],
    [2200, 1100, 'display'],
    [2310, 1100, 'ultrawide'],
  ] as const)('selects %sx%s as %s', (width, height, profile) => {
    expect(selectCanvasProfile({ width, height })).toBe(profile)
  })

  it('coalesces resize updates without publishing retired stage state', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    document.documentElement.dataset.stageProfile = 'standard'
    document.documentElement.dataset.stageDensity = 'balanced'
    document.documentElement.style.setProperty('--stage-gap', '16px')
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 7
    })

    const { result } = renderHook(() => useCanvasViewport())

    expect(result.current).toEqual({ width: 1600, height: 900, profile: 'standard' })
    expect(document.documentElement.dataset.stageProfile).toBeUndefined()
    expect(document.documentElement.dataset.stageDensity).toBeUndefined()
    expect(document.documentElement.style.getPropertyValue('--stage-gap')).toBe('')

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
      window.dispatchEvent(new Event('resize'))
      frame?.(0)
    })

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(result.current).toEqual({ width: 800, height: 600, profile: 'compact' })
  })

  it('removes its listener and pending frame without a post-unmount update', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(19)
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const { unmount } = renderHook(() => useCanvasViewport())

    act(() => window.dispatchEvent(new Event('resize')))
    unmount()

    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(cancel).toHaveBeenCalledWith(19)
  })
})
