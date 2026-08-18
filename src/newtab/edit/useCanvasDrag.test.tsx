// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCanvasDrag } from './useCanvasDrag'
import type { BlockId } from '../../lib/layout/types'

function rect(left: number, top: number, width: number, height: number): DOMRectReadOnly {
  return {
    left, top, width, height,
    right: left + width, bottom: top + height,
    x: left, y: top,
    toJSON: () => ({}),
  } as DOMRectReadOnly
}

function setup() {
  const surface = document.createElement('section')
  document.body.append(surface)
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1000, 500))
  const itemRects = new Map<BlockId, DOMRectReadOnly>([
    ['clock', rect(100, 100, 200, 100)],
    ['weather', rect(500, 100, 200, 100)],
  ])
  const onPreviewMove = vi.fn()
  const onDrop = vi.fn()
  const rendered = renderHook(() => useCanvasDrag({
    getSurface: () => surface,
    getItemRects: () => itemRects,
    onPreviewMove,
    onDrop,
  }))
  return { surface, rendered, onPreviewMove, onDrop }
}

function pointerEvent(type: string, init: { clientX: number; clientY: number; pointerId: number }) {
  const event = new Event(type, { bubbles: true }) as PointerEvent & {
    clientX: number
    clientY: number
    pointerId: number
  }
  Object.assign(event, init)
  return event
}

describe('useCanvasDrag', () => {
  it('streams grid-snapped center percents: first move flagged, then live, then drop', () => {
    const { surface, rendered, onPreviewMove, onDrop } = setup()

    // Grab the clock 10px inside its corner.
    act(() => rendered.result.current.startDrag('clock', { clientX: 110, clientY: 110, pointerId: 1 }))
    expect(rendered.result.current.dragging).toBe('clock')

    // Move so the raw top-left would land at (200, 200) — a grid multiple.
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 210, clientY: 210, pointerId: 1 })) })
    expect(onPreviewMove).toHaveBeenLastCalledWith('clock', { xPct: 30, yPct: 50 }, true)

    // A second move is live (not a new undo entry): raw top-left (240, 240).
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 250, clientY: 250, pointerId: 1 })) })
    const [id, point, first] = onPreviewMove.mock.calls.at(-1) as [string, { xPct: number; yPct: number }, boolean]
    expect(id).toBe('clock')
    expect(point.xPct).toBeCloseTo(34, 5)
    expect(point.yPct).toBeCloseTo(58, 5)
    expect(first).toBe(false)

    act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 250, clientY: 250, pointerId: 1 })) })
    expect(onDrop).toHaveBeenCalledOnce()
    expect(rendered.result.current.dragging).toBeNull()
    expect(rendered.result.current.guides).toEqual([])
  })

  it('publishes magnetic guides when aligned with a neighbor edge and clamps to the surface inset', () => {
    const { surface, rendered, onPreviewMove } = setup()
    act(() => rendered.result.current.startDrag('clock', { clientX: 110, clientY: 110, pointerId: 7 }))

    // Raw top-left would be (497, 100): within 6px of weather's left edge
    // (500) — the magnet snaps x to 500 and publishes a guide.
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 507, clientY: 110, pointerId: 7 })) })
    expect(rendered.result.current.guides.some((guide) => guide.axis === 'x' && guide.value === 500)).toBe(true)
    expect(onPreviewMove).toHaveBeenLastCalledWith('clock', { xPct: 60, yPct: 30 }, true)

    // Dragging far past the left edge clamps at the 8px inset.
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: -300, clientY: 110, pointerId: 7 })) })
    const lastPoint = onPreviewMove.mock.calls.at(-1)?.[1] as { xPct: number }
    expect(lastPoint.xPct).toBeCloseTo((8 + 100) / 1000 * 100, 5)
  })
})
