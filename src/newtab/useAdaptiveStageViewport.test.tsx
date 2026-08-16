// @vitest-environment jsdom
import { useLayoutEffect } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAdaptiveStageViewport } from './useAdaptiveStageViewport'

describe('useAdaptiveStageViewport', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('data-stage-profile')
    document.documentElement.removeAttribute('data-stage-density')
    document.documentElement.removeAttribute('style')
  })

  it('publishes its authoritative root contract before a consumer layout effect can observe the render', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    let prePaint: { profile?: string; density?: string; gap: string } | undefined

    renderHook(() => {
      const viewport = useAdaptiveStageViewport('balanced')
      useLayoutEffect(() => {
        prePaint = {
          profile: document.documentElement.dataset.stageProfile,
          density: document.documentElement.dataset.stageDensity,
          gap: document.documentElement.style.getPropertyValue('--stage-gap'),
        }
      }, [viewport.profile, viewport.density])
      return viewport
    })

    expect(prePaint).toEqual({ profile: 'standard', density: 'balanced', gap: '16px' })
  })

  it.each([
    [899, 900, 'compact'], [900, 699, 'compact'], [900, 700, 'standard'],
    [1599, 700, 'standard'], [1600, 762, 'standard'], [1600, 761, 'ultrawide'],
    [2199, 1100, 'standard'], [2200, 1099, 'standard'], [2200, 1100, 'display'],
    [2310, 1100, 'ultrawide'],
  ] as const)('keeps the pre-paint JS/CSS owner on the %sx%s profile fencepost (%s)', (width, height, profile) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
    const { result, unmount } = renderHook(() => useAdaptiveStageViewport('compact'))
    expect(result.current.profile).toBe(profile)
    expect(document.documentElement.dataset.stageProfile).toBe(profile)
    unmount()
  })

  it('owns the profile, density, and frozen CSS variables and replaces them after one coalesced resize', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 7
    })
    const { result } = renderHook(() => useAdaptiveStageViewport('balanced'))

    expect(result.current).toMatchObject({ width: 1600, height: 900, profile: 'standard', density: 'balanced' })
    expect(document.documentElement.dataset.stageProfile).toBe('standard')
    expect(document.documentElement.dataset.stageDensity).toBe('balanced')
    expect(document.documentElement.style.getPropertyValue('--stage-gap')).toBe('16px')
    expect(document.documentElement.style.getPropertyValue('--stage-now-cols')).toBe('4')

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
      window.dispatchEvent(new Event('resize'))
      frame?.(0)
    })
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(result.current.profile).toBe('compact')
    expect(document.documentElement.style.getPropertyValue('--stage-day-cols')).toBe('2')
  })

  it('removes its listener, pending frame, attributes, and variables without a post-unmount update', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(19)
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const { unmount } = renderHook(() => useAdaptiveStageViewport('compact'))
    act(() => window.dispatchEvent(new Event('resize')))
    unmount()
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(cancel).toHaveBeenCalledWith(19)
    expect(document.documentElement.hasAttribute('data-stage-profile')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--stage-gap')).toBe('')
  })
})
