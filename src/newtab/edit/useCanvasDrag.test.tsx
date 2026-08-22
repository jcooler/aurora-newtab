// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { STACK_HOLD_MS, useCanvasDrag } from './useCanvasDrag'
import type { BlockId } from '../../lib/layout/types'

function rect(left: number, top: number, width: number, height: number): DOMRectReadOnly {
  return {
    left, top, width, height,
    right: left + width, bottom: top + height,
    x: left, y: top,
    toJSON: () => ({}),
  } as DOMRectReadOnly
}

function setup(canDock?: (id: BlockId) => boolean) {
  const surface = document.createElement('section')
  document.body.append(surface)
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1000, 500))
  const itemRects = new Map<string, DOMRectReadOnly>([
    ['clock', rect(100, 100, 200, 100)],
    ['weather', rect(500, 100, 200, 100)],
    ['monthCal', rect(100, 300, 200, 100)],
    ['stack:stack-day', rect(700, 250, 220, 140)],
  ])
  const onPreviewMove = vi.fn()
  const onDrop = vi.fn()
  const onZoneChange = vi.fn()
  const rendered = renderHook(() => useCanvasDrag({
    getSurface: () => surface,
    getItemRects: () => itemRects,
    onPreviewMove,
    onDrop,
    onZoneChange,
    canDock,
  }))
  return { surface, rendered, onPreviewMove, onDrop, onZoneChange }
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
    act(() => rendered.result.current.startDrag({ kind: 'widget', id: 'clock' }, { clientX: 110, clientY: 110, pointerId: 1 }))
    expect(rendered.result.current.dragging).toEqual({ kind: 'widget', id: 'clock' })

    // Move so the raw top-left would land at (200, 200) — a grid multiple.
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 210, clientY: 210, pointerId: 1 })) })
    expect(onPreviewMove).toHaveBeenLastCalledWith({ kind: 'widget', id: 'clock' }, { xPct: 30, yPct: 50 }, true, { zone: null, pointerX: 210 })

    // A second move is live (not a new undo entry): raw top-left (240, 240).
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 250, clientY: 250, pointerId: 1 })) })
    const [subject, point, first] = onPreviewMove.mock.calls.at(-1) as [{ kind: string; id: string }, { xPct: number; yPct: number }, boolean]
    expect(subject).toEqual({ kind: 'widget', id: 'clock' })
    expect(point.xPct).toBeCloseTo(34, 5)
    expect(point.yPct).toBeCloseTo(58, 5)
    expect(first).toBe(false)

    act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 250, clientY: 250, pointerId: 1 })) })
    expect(onDrop).toHaveBeenCalledOnce()
    expect(onDrop).toHaveBeenCalledWith({ zone: null, pointerX: 250, point: expect.any(Object), stackTarget: null })
    expect(rendered.result.current.dragging).toBeNull()
    expect(rendered.result.current.guides).toEqual([])
  })

  it('reports dock zones near the top and bottom edges and the drop context', () => {
    const { surface, rendered, onDrop, onZoneChange } = setup()
    act(() => rendered.result.current.startDrag({ kind: 'widget', id: 'clock' }, { clientX: 110, clientY: 110, pointerId: 3 }))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 20, pointerId: 3 })) })
    expect(onZoneChange).toHaveBeenLastCalledWith('top')
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 480, pointerId: 3 })) })
    expect(onZoneChange).toHaveBeenLastCalledWith('bottom')
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 250, pointerId: 3 })) })
    expect(onZoneChange).toHaveBeenLastCalledWith(null)
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 15, pointerId: 3 })) })
    act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 15, pointerId: 3 })) })
    expect(onDrop).toHaveBeenLastCalledWith({ zone: 'top', pointerX: 300, point: expect.any(Object), stackTarget: null })
    // Zone state clears with the drop.
    expect(onZoneChange).toHaveBeenLastCalledWith(null)
  })

  it('never offers a dock zone for a widget canDock rejects (owner-reported 2026-08-18: docked Month)', () => {
    const { surface, rendered, onDrop, onZoneChange } = setup((id) => id !== 'monthCal')

    // monthCal dragged to the very top edge: no zone, and the drop carries
    // zone null — the widget simply lands free where it was dropped.
    act(() => rendered.result.current.startDrag({ kind: 'widget', id: 'monthCal' }, { clientX: 110, clientY: 310, pointerId: 9 }))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 20, pointerId: 9 })) })
    expect(onZoneChange).not.toHaveBeenCalledWith('top')
    act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 20, pointerId: 9 })) })
    expect(onDrop).toHaveBeenLastCalledWith({ zone: null, pointerX: 300, point: expect.any(Object), stackTarget: null })

    // A dockable widget still gets the zone under the same predicate.
    act(() => rendered.result.current.startDrag({ kind: 'widget', id: 'clock' }, { clientX: 110, clientY: 110, pointerId: 10 }))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 20, pointerId: 10 })) })
    expect(onZoneChange).toHaveBeenLastCalledWith('top')
    act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 20, pointerId: 10 })) })
    expect(onDrop).toHaveBeenLastCalledWith({ zone: 'top', pointerX: 300, point: expect.any(Object), stackTarget: null })
  })

  it('every preview move carries the live dock-band state so callers can dock/reorder/undock continuously', () => {
    const { surface, rendered, onPreviewMove } = setup()
    act(() => rendered.result.current.startDrag({ kind: 'widget', id: 'clock' }, { clientX: 110, clientY: 110, pointerId: 12 }))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 20, pointerId: 12 })) })
    expect(onPreviewMove.mock.calls.at(-1)?.[3]).toEqual({ zone: 'top', pointerX: 300 })
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 320, clientY: 250, pointerId: 12 })) })
    expect(onPreviewMove.mock.calls.at(-1)?.[3]).toEqual({ zone: null, pointerX: 320 })
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 340, clientY: 480, pointerId: 12 })) })
    expect(onPreviewMove.mock.calls.at(-1)?.[3]).toEqual({ zone: 'bottom', pointerX: 340 })
    act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 340, clientY: 480, pointerId: 12 })) })
  })

  it('a pointer inside a RENDERED strip is in that band even beyond the 56px threshold (fixed strips overlay the surface)', () => {
    // The probe-measured defect: the bottom strip painted at y 783-884 over
    // a 900-tall surface, but the band only covered y 844+ — grabbing a
    // docked member in the strip's upper half read as "outside the dock"
    // and undocked it mid-reorder.
    const bar = document.createElement('nav')
    bar.className = 'canvas-bottom-bar'
    document.body.append(bar)
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(rect(0, 380, 1000, 100))
    try {
      const { surface, rendered, onPreviewMove } = setup()
      act(() => rendered.result.current.startDrag({ kind: 'widget', id: 'clock' }, { clientX: 110, clientY: 110, pointerId: 14 }))
      // y=400: inside the strip's rect, but NOT within 56px of the surface
      // bottom (500 - 56 = 444).
      act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 400, pointerId: 14 })) })
      expect(onPreviewMove.mock.calls.at(-1)?.[3]).toEqual({ zone: 'bottom', pointerX: 300 })
      act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 400, pointerId: 14 })) })
    } finally {
      bar.remove()
    }
  })

  it('publishes magnetic guides when aligned with a neighbor edge and clamps to the surface inset', () => {
    const { surface, rendered, onPreviewMove } = setup()
    act(() => rendered.result.current.startDrag({ kind: 'widget', id: 'clock' }, { clientX: 110, clientY: 110, pointerId: 7 }))

    // Raw top-left would be (497, 100): within 6px of weather's left edge
    // (500) — the magnet snaps x to 500 and publishes a guide.
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 507, clientY: 110, pointerId: 7 })) })
    expect(rendered.result.current.guides.some((guide) => guide.axis === 'x' && guide.value === 500)).toBe(true)
    expect(onPreviewMove).toHaveBeenLastCalledWith({ kind: 'widget', id: 'clock' }, { xPct: 60, yPct: 30 }, true, { zone: null, pointerX: 507 })

    // Dragging far past the left edge clamps at the 8px inset.
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: -300, clientY: 110, pointerId: 7 })) })
    const lastPoint = onPreviewMove.mock.calls.at(-1)?.[1] as { xPct: number }
    expect(lastPoint.xPct).toBeCloseTo((8 + 100) / 1000 * 100, 5)
  })

  it('marks a widget target only after the full hold, clears on leave or dock, and drops only the marked target', () => {
    vi.useFakeTimers()
    try {
      const { surface, rendered, onDrop } = setup()
      act(() => rendered.result.current.startDrag({ kind: 'widget', id: 'clock' }, { clientX: 110, clientY: 110, pointerId: 21 }))
      act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 550, clientY: 120, pointerId: 21 })) })
      act(() => vi.advanceTimersByTime(STACK_HOLD_MS - 1))
      expect(rendered.result.current.stackTarget).toBeNull()
      act(() => vi.advanceTimersByTime(1))
      expect(rendered.result.current.stackTarget).toEqual({ kind: 'widget', id: 'weather' })

      act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 250, pointerId: 21 })) })
      expect(rendered.result.current.stackTarget).toBeNull()
      act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 550, clientY: 120, pointerId: 21 })) })
      act(() => vi.advanceTimersByTime(STACK_HOLD_MS))
      expect(rendered.result.current.stackTarget).toEqual({ kind: 'widget', id: 'weather' })
      act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 550, clientY: 20, pointerId: 21 })) })
      expect(rendered.result.current.stackTarget).toBeNull()

      act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 550, clientY: 120, pointerId: 21 })) })
      act(() => vi.advanceTimersByTime(STACK_HOLD_MS))
      act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 550, clientY: 120, pointerId: 21 })) })
      expect(onDrop).toHaveBeenLastCalledWith(expect.objectContaining({
        zone: null,
        stackTarget: { kind: 'widget', id: 'weather' },
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('restarts the hold when the candidate changes and can append to an existing stack', () => {
    vi.useFakeTimers()
    try {
      const { surface, rendered } = setup()
      act(() => rendered.result.current.startDrag({ kind: 'widget', id: 'clock' }, { clientX: 110, clientY: 110, pointerId: 22 }))
      act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 550, clientY: 120, pointerId: 22 })) })
      act(() => vi.advanceTimersByTime(400))
      act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 760, clientY: 300, pointerId: 22 })) })
      act(() => vi.advanceTimersByTime(499))
      expect(rendered.result.current.stackTarget).toBeNull()
      act(() => vi.advanceTimersByTime(1))
      expect(rendered.result.current.stackTarget).toEqual({ kind: 'stack', id: 'stack-day' })
      act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 760, clientY: 300, pointerId: 22 })) })
    } finally {
      vi.useRealTimers()
    }
  })

  it('never makes a stack or stack-member subject a stack source or dock candidate', () => {
    vi.useFakeTimers()
    try {
      const canDock = vi.fn(() => true)
      const { surface, rendered, onDrop } = setup(canDock)
      act(() => rendered.result.current.startDrag({ kind: 'stack', id: 'stack-day' }, { clientX: 710, clientY: 260, pointerId: 23 }))
      act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 550, clientY: 20, pointerId: 23 })) })
      act(() => vi.advanceTimersByTime(STACK_HOLD_MS))
      expect(rendered.result.current.stackTarget).toBeNull()
      expect(canDock).not.toHaveBeenCalled()
      act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 550, clientY: 20, pointerId: 23 })) })
      expect(onDrop).toHaveBeenLastCalledWith(expect.objectContaining({ zone: null, stackTarget: null }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses document listeners for inspector-origin member drags and cleans them after release', () => {
    const { rendered, onPreviewMove, onDrop } = setup()
    const subject = { kind: 'stack-member' as const, stackId: 'stack-day', id: 'clock' as const }
    act(() => rendered.result.current.startDrag(subject, { clientX: 900, clientY: 400, pointerId: 24 }))
    act(() => { document.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 250, pointerId: 24 })) })
    expect(onPreviewMove.mock.calls.at(-1)?.[0]).toEqual(subject)
    act(() => { document.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 250, pointerId: 24 })) })
    expect(onDrop).toHaveBeenCalledOnce()
    const calls = onPreviewMove.mock.calls.length
    act(() => { document.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 300, pointerId: 24 })) })
    expect(onPreviewMove).toHaveBeenCalledTimes(calls)
  })

  it.each([
    ['free widget movement', { kind: 'widget', id: 'clock' } as const, { x: 300, y: 250 }],
    ['dock movement', { kind: 'widget', id: 'clock' } as const, { x: 300, y: 20 }],
    ['inspector member detachment', { kind: 'stack-member', stackId: 'stack-day', id: 'clock' } as const, { x: 300, y: 250 }],
  ])('never turns pointercancel into %s drop semantics', (_label, subject, point) => {
    const { rendered, onDrop } = setup()
    act(() => rendered.result.current.startDrag(subject, { clientX: 110, clientY: 110, pointerId: 51 }))
    act(() => { document.dispatchEvent(pointerEvent('pointermove', { clientX: point.x, clientY: point.y, pointerId: 51 })) })
    act(() => { document.dispatchEvent(pointerEvent('pointercancel', { clientX: point.x, clientY: point.y, pointerId: 51 })) })

    expect(onDrop).not.toHaveBeenCalled()
    expect(rendered.result.current.dragging).toBeNull()
    expect(rendered.result.current.guides).toEqual([])
  })
})
