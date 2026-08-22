// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BlockId } from '../../lib/layout/types'
import { STACK_HOLD_MS, useCanvasDrag } from './useCanvasDrag'

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
  const top = document.createElement('nav')
  const bottom = document.createElement('nav')
  top.className = 'canvas-top-bar'
  bottom.className = 'canvas-bottom-bar'
  document.body.append(surface, top, bottom)
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1000, 500))
  vi.spyOn(top, 'getBoundingClientRect').mockReturnValue(rect(72, 16, 856, 96))
  vi.spyOn(bottom, 'getBoundingClientRect').mockReturnValue(rect(72, 388, 856, 96))
  const itemRects = new Map<string, DOMRectReadOnly>([
    ['clock', rect(100, 180, 100, 40)],
    ['weather', rect(500, 180, 120, 50)],
    ['monthCal', rect(100, 300, 180, 100)],
    ['stack:stack-day', rect(700, 250, 220, 140)],
  ])
  const onPreviewMove = vi.fn()
  const onDrop = vi.fn()
  const onCancel = vi.fn()
  const onZoneChange = vi.fn()
  const rendered = renderHook(() => useCanvasDrag({
    getSurface: () => surface,
    getItemRects: () => itemRects,
    onPreviewMove,
    onDrop,
    onCancel,
    onZoneChange,
    canDock,
  }))
  return {
    surface,
    top,
    bottom,
    itemRects,
    rendered,
    onPreviewMove,
    onDrop,
    onCancel,
    onZoneChange,
  }
}

function pointerEvent(
  type: string,
  init: { clientX: number; clientY: number; pointerId: number; altKey?: boolean },
) {
  const event = new Event(type, { bubbles: true }) as PointerEvent & {
    clientX: number
    clientY: number
    pointerId: number
    altKey: boolean
  }
  Object.assign(event, { altKey: false, ...init })
  return event
}

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useCanvasDrag two-axis placement state', () => {
  it('streams canvas -> top -> canvas -> bottom as one explicit placement sequence', () => {
    const { surface, rendered, onPreviewMove, onDrop, onZoneChange } = setup()
    act(() => rendered.result.current.startDrag(
      { kind: 'widget', id: 'clock' },
      { clientX: 110, clientY: 190, pointerId: 1 },
    ))

    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 60, pointerId: 1 })) })
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 320, clientY: 250, pointerId: 1 })) })
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 340, clientY: 430, pointerId: 1 })) })

    expect(onPreviewMove.mock.calls.map((call) => call[1].kind)).toEqual(['dock', 'canvas', 'dock'])
    expect(onPreviewMove.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ kind: 'dock', dock: 'top' }))
    expect(onPreviewMove.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ kind: 'canvas' }))
    expect(onPreviewMove.mock.calls[2]?.[1]).toEqual(expect.objectContaining({ kind: 'dock', dock: 'bottom' }))
    expect(onPreviewMove.mock.calls.map((call) => call[2])).toEqual([true, false, false])
    expect(onPreviewMove.mock.calls[2]?.[3]).toEqual({ clientX: 340, clientY: 430, altKey: false })
    expect(onZoneChange.mock.calls.map((call) => call[0])).toEqual(['top', null, 'bottom'])

    act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 340, clientY: 430, pointerId: 1 })) })
    expect(onDrop).toHaveBeenCalledWith({
      placement: expect.objectContaining({ kind: 'dock', dock: 'bottom' }),
      stackTarget: null,
    })
    expect(rendered.result.current.dragging).toBeNull()
    expect(rendered.result.current.guideSet).toBeNull()
    expect(onZoneChange).toHaveBeenLastCalledWith(null)
  })

  it('re-reads the live presentation box while preserving the normalized grab point', () => {
    const { surface, itemRects, rendered, onPreviewMove } = setup()
    // Grab at 25% / 25% of the original 100 x 40 free widget.
    act(() => rendered.result.current.startDrag(
      { kind: 'widget', id: 'clock' },
      { clientX: 125, clientY: 190, pointerId: 2 },
    ))
    // Docked presentation changes the live member to 200 x 60.
    itemRects.set('clock', rect(200, 20, 200, 60))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', {
      clientX: 300,
      clientY: 50,
      pointerId: 2,
      altKey: true,
    })) })

    const placement = onPreviewMove.mock.calls.at(-1)?.[1]
    expect(placement).toEqual(expect.objectContaining({ kind: 'dock', dock: 'top' }))
    if (placement?.kind !== 'dock') throw new Error('Expected a dock placement')
    // band-local pointer (228, 34) + (.5 - .25) of live 200 x 60.
    expect(placement.point.xPct).toBeCloseTo(278 / 856 * 100, 5)
    expect(placement.point.yPct).toBeCloseTo(49 / 96 * 100, 5)
  })

  it('recomputes the final drop from the live presentation box at pointer release', () => {
    const { surface, itemRects, rendered, onDrop } = setup()
    act(() => rendered.result.current.startDrag(
      { kind: 'widget', id: 'clock' },
      { clientX: 125, clientY: 190, pointerId: 12 },
    ))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', {
      clientX: 300, clientY: 50, pointerId: 12, altKey: true,
    })) })
    // The first dock render replaces the 100 x 40 card with a 200 x 60 line
    // before release. The final placement must contain that live box.
    itemRects.set('clock', rect(200, 20, 200, 60))
    act(() => { surface.dispatchEvent(pointerEvent('pointerup', {
      clientX: 300, clientY: 50, pointerId: 12, altKey: true,
    })) })

    const placement = onDrop.mock.calls[0]?.[0].placement
    expect(placement?.kind).toBe('dock')
    if (placement?.kind !== 'dock') throw new Error('Expected a dock placement')
    expect(placement.point.xPct).toBeCloseTo(278 / 856 * 100, 5)
    expect(placement.point.yPct).toBeCloseTo(49 / 96 * 100, 5)
  })

  it('refreshes the visible preview when docking changes the live presentation size before release', () => {
    let frame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frame = callback
      return 1
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { surface, itemRects, rendered, onPreviewMove } = setup()
    act(() => rendered.result.current.startDrag(
      { kind: 'widget', id: 'clock' },
      { clientX: 125, clientY: 190, pointerId: 13 },
    ))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', {
      clientX: 300, clientY: 50, pointerId: 13, altKey: true,
    })) })
    const first = onPreviewMove.mock.calls.at(-1)?.[1]
    if (first?.kind !== 'dock') throw new Error('Expected a dock placement')

    // React has painted the docked line at its new size while the pointer is
    // still held and stationary. The preview must converge now, not jump only
    // when pointerup re-runs geometry.
    itemRects.set('clock', rect(200, 20, 200, 60))
    expect(frame).toBeTypeOf('function')
    act(() => frame?.(16))

    expect(onPreviewMove).toHaveBeenCalledTimes(2)
    const refreshed = onPreviewMove.mock.calls.at(-1)?.[1]
    if (refreshed?.kind !== 'dock') throw new Error('Expected a dock placement')
    expect(refreshed.point.xPct).toBeCloseTo(278 / 856 * 100, 5)
    expect(refreshed.point.yPct).toBeCloseTo(49 / 96 * 100, 5)
  })

  it('publishes dock-local X/Y guides and clears that guide space on band exit', () => {
    const { surface, rendered } = setup()
    act(() => rendered.result.current.startDrag(
      { kind: 'widget', id: 'clock' },
      { clientX: 150, clientY: 200, pointerId: 3 },
    ))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 64, pointerId: 3 })) })
    expect(rendered.result.current.guideSet).toEqual({
      space: 'top',
      guides: expect.arrayContaining([
        { axis: 'x', value: 428, kind: 'canvas-center' },
        { axis: 'y', value: 48, kind: 'canvas-center' },
      ]),
    })

    act(() => { surface.dispatchEvent(pointerEvent('pointermove', {
      clientX: 347,
      clientY: 257,
      pointerId: 3,
      altKey: true,
    })) })
    expect(rendered.result.current.guideSet).toEqual({ space: 'canvas', guides: [] })
  })

  it('bypasses dock magnetism while Alt is held but keeps the same safety band', () => {
    const { surface, rendered, onPreviewMove } = setup()
    act(() => rendered.result.current.startDrag(
      { kind: 'widget', id: 'clock' },
      { clientX: 150, clientY: 200, pointerId: 4 },
    ))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 503, clientY: 67, pointerId: 4 })) })
    const snapped = onPreviewMove.mock.calls.at(-1)?.[1]
    expect(snapped?.kind).toBe('dock')
    if (snapped?.kind !== 'dock') throw new Error('Expected a dock placement')
    expect(snapped.point).toEqual({ xPct: 50, yPct: 50 })

    act(() => { surface.dispatchEvent(pointerEvent('pointermove', {
      clientX: 503,
      clientY: 67,
      pointerId: 4,
      altKey: true,
    })) })
    const unsnapped = onPreviewMove.mock.calls.at(-1)?.[1]
    expect(unsnapped?.kind).toBe('dock')
    if (unsnapped?.kind !== 'dock') throw new Error('Expected a dock placement')
    expect(unsnapped.point.xPct).not.toBe(50)
    expect(unsnapped.point.yPct).not.toBe(50)
    expect(rendered.result.current.guideSet).toEqual({ space: 'top', guides: [] })
  })

  it('uses the canvas snap path and clamps a free member box to the surface inset', () => {
    const { surface, rendered, onPreviewMove } = setup()
    act(() => rendered.result.current.startDrag(
      { kind: 'widget', id: 'clock' },
      { clientX: 110, clientY: 190, pointerId: 5 },
    ))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: -300, clientY: 250, pointerId: 5 })) })
    const placement = onPreviewMove.mock.calls.at(-1)?.[1]
    expect(placement?.kind).toBe('canvas')
    if (placement?.kind !== 'canvas') throw new Error('Expected a canvas placement')
    expect(placement.point.xPct).toBeCloseTo((8 + 50) / 1000 * 100, 5)
    expect(rendered.result.current.guideSet?.space).toBe('canvas')
  })

  it('never offers dock placement to a widget rejected by the content contract', () => {
    const { surface, rendered, onPreviewMove, onZoneChange } = setup((id) => id !== 'monthCal')
    act(() => rendered.result.current.startDrag(
      { kind: 'widget', id: 'monthCal' },
      { clientX: 110, clientY: 310, pointerId: 6 },
    ))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 60, pointerId: 6 })) })
    expect(onPreviewMove.mock.calls.at(-1)?.[1].kind).toBe('canvas')
    expect(onZoneChange).not.toHaveBeenCalledWith('top')
  })

  it.each(['pointercancel', 'lostpointercapture', 'api'] as const)(
    'cancels through %s without drop semantics and removes every listener',
    (finish) => {
      const { surface, rendered, onPreviewMove, onDrop, onCancel, onZoneChange } = setup()
      const subject = { kind: 'widget' as const, id: 'clock' as const }
      act(() => rendered.result.current.startDrag(subject, { clientX: 110, clientY: 190, pointerId: 7 }))
      act(() => { document.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 60, pointerId: 7 })) })

      if (finish === 'api') {
        act(() => rendered.result.current.cancelDrag())
      } else {
        act(() => {
          const target = finish === 'lostpointercapture' ? surface : document
          target.dispatchEvent(pointerEvent(finish, { clientX: 300, clientY: 60, pointerId: 7 }))
        })
      }

      expect(onCancel).toHaveBeenCalledOnce()
      expect(onCancel).toHaveBeenCalledWith(subject)
      expect(onDrop).not.toHaveBeenCalled()
      expect(rendered.result.current.dragging).toBeNull()
      expect(rendered.result.current.guideSet).toBeNull()
      expect(onZoneChange).toHaveBeenLastCalledWith(null)

      const calls = onPreviewMove.mock.calls.length
      act(() => { document.dispatchEvent(pointerEvent('pointermove', { clientX: 600, clientY: 250, pointerId: 7 })) })
      expect(onPreviewMove).toHaveBeenCalledTimes(calls)
    },
  )

  it('removes document and surface listeners after a successful drop too', () => {
    const { rendered, onPreviewMove, onDrop } = setup()
    act(() => rendered.result.current.startDrag(
      { kind: 'widget', id: 'clock' },
      { clientX: 110, clientY: 190, pointerId: 8 },
    ))
    act(() => { document.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 250, pointerId: 8 })) })
    act(() => { document.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 250, pointerId: 8 })) })
    expect(onDrop).toHaveBeenCalledOnce()
    const calls = onPreviewMove.mock.calls.length
    act(() => { document.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 300, pointerId: 8 })) })
    expect(onPreviewMove).toHaveBeenCalledTimes(calls)
  })

  it('keeps whole-stack and stack-member subjects canvas-only', () => {
    const canDock = vi.fn(() => true)
    const { surface, rendered, onPreviewMove, onZoneChange } = setup(canDock)

    act(() => rendered.result.current.startDrag(
      { kind: 'stack', id: 'stack-day' },
      { clientX: 710, clientY: 260, pointerId: 9 },
    ))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 550, clientY: 60, pointerId: 9 })) })
    expect(onPreviewMove.mock.calls.at(-1)?.[1].kind).toBe('canvas')
    expect(onZoneChange).not.toHaveBeenCalledWith('top')
    act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 550, clientY: 60, pointerId: 9 })) })

    act(() => rendered.result.current.startDrag(
      { kind: 'stack-member', stackId: 'stack-day', id: 'clock' },
      { clientX: 900, clientY: 400, pointerId: 10 },
    ))
    act(() => { document.dispatchEvent(pointerEvent('pointermove', { clientX: 550, clientY: 430, pointerId: 10 })) })
    expect(onPreviewMove.mock.calls.at(-1)?.[1].kind).toBe('canvas')
    expect(canDock).not.toHaveBeenCalled()
  })

  it('marks a widget target only after a continuous canvas-space hold', () => {
    vi.useFakeTimers()
    const { surface, rendered, onDrop } = setup()
    act(() => rendered.result.current.startDrag(
      { kind: 'widget', id: 'clock' },
      { clientX: 110, clientY: 190, pointerId: 11 },
    ))
    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 550, clientY: 200, pointerId: 11 })) })
    act(() => vi.advanceTimersByTime(STACK_HOLD_MS))
    expect(rendered.result.current.stackTarget).toEqual({ kind: 'widget', id: 'weather' })

    act(() => { surface.dispatchEvent(pointerEvent('pointermove', { clientX: 550, clientY: 60, pointerId: 11 })) })
    expect(rendered.result.current.stackTarget).toBeNull()
    act(() => { surface.dispatchEvent(pointerEvent('pointerup', { clientX: 550, clientY: 60, pointerId: 11 })) })
    expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ stackTarget: null }))
  })
})
