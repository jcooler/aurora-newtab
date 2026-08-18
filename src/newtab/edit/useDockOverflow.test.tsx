// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useRef } from 'react'
import { useDockOverflow } from './useDockOverflow'

function makeScroller(metrics: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  const element = document.createElement('div')
  document.body.append(element)
  let scrollLeft = metrics.scrollLeft
  Object.defineProperty(element, 'scrollWidth', { configurable: true, get: () => metrics.scrollWidth })
  Object.defineProperty(element, 'clientWidth', { configurable: true, get: () => metrics.clientWidth })
  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => { scrollLeft = value },
  })
  return element
}

function renderOverflow(element: HTMLElement, memberCount: number) {
  return renderHook(({ count }) => {
    const ref = useRef<HTMLElement | null>(element)
    return useDockOverflow(ref, count)
  }, { initialProps: { count: memberCount } })
}

describe('useDockOverflow', () => {
  it('reports no overflow when content fits — scroll affordances key on TRUE overflow only', () => {
    const element = makeScroller({ scrollWidth: 400, clientWidth: 400, scrollLeft: 0 })
    const { result } = renderOverflow(element, 3)
    expect(result.current).toEqual({ overflowing: false, atStart: true, atEnd: true })
  })

  it('reports overflow with start/end edges tracking scroll position', () => {
    const element = makeScroller({ scrollWidth: 900, clientWidth: 400, scrollLeft: 0 })
    const { result } = renderOverflow(element, 8)
    expect(result.current).toEqual({ overflowing: true, atStart: true, atEnd: false })

    act(() => {
      element.scrollLeft = 250
      element.dispatchEvent(new Event('scroll'))
    })
    expect(result.current).toEqual({ overflowing: true, atStart: false, atEnd: false })

    act(() => {
      element.scrollLeft = 500
      element.dispatchEvent(new Event('scroll'))
    })
    expect(result.current).toEqual({ overflowing: true, atStart: false, atEnd: true })
  })

  it('re-measures when the member count changes', () => {
    const metrics = { scrollWidth: 400, clientWidth: 400, scrollLeft: 0 }
    const element = makeScroller(metrics)
    const { result, rerender } = renderOverflow(element, 3)
    expect(result.current.overflowing).toBe(false)

    metrics.scrollWidth = 1200
    rerender({ count: 10 })
    expect(result.current.overflowing).toBe(true)
  })
})
