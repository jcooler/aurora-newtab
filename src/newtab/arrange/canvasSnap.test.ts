import { describe, expect, it } from 'vitest'
import {
  canvasKeyboardDelta,
  snapCanvasPosition,
  type SnapNeighbor,
} from './canvasSnap'

const BOUNDS = { width: 1000, height: 800, inset: 8 }
const BOX = { width: 200, height: 100 }
const NEIGHBORS: readonly SnapNeighbor[] = [
  { id: 'focus', left: 300, top: 240, width: 240, height: 120 },
]

describe('Canvas snapping and guides', () => {
  it('snaps to the 8px grid while preserving the pointer grab offset', () => {
    const result = snapCanvasPosition({
      pointer: { x: 451, y: 333 },
      pointerOffset: { x: 37, y: 21 },
      box: BOX,
      bounds: BOUNDS,
      neighbors: [],
    })
    expect(result.left).toBe(416)
    expect(result.top).toBe(312)
  })

  it('clamps every edge to the 8px safe margin', () => {
    expect(snapCanvasPosition({ pointer: { x: -100, y: -100 }, pointerOffset: { x: 0, y: 0 }, box: BOX, bounds: BOUNDS, neighbors: [] }))
      .toMatchObject({ left: 8, top: 8 })
    expect(snapCanvasPosition({ pointer: { x: 5000, y: 5000 }, pointerOffset: { x: 0, y: 0 }, box: BOX, bounds: BOUNDS, neighbors: [] }))
      .toMatchObject({ left: 792, top: 692 })
  })

  it('prefers magnetic canvas-center guides inside the written threshold', () => {
    const result = snapCanvasPosition({
      pointer: { x: 502, y: 401 },
      pointerOffset: { x: 100, y: 50 },
      box: BOX,
      bounds: BOUNDS,
      neighbors: [],
    })
    expect(result.left).toBe(400)
    expect(result.top).toBe(350)
    expect(result.guides).toEqual(expect.arrayContaining([
      { axis: 'x', value: 500, kind: 'canvas-center' },
      { axis: 'y', value: 400, kind: 'canvas-center' },
    ]))
  })

  it('publishes neighboring edge and center guides without moving the neighbor', () => {
    const result = snapCanvasPosition({
      pointer: { x: 639, y: 301 },
      pointerOffset: { x: 100, y: 50 },
      box: BOX,
      bounds: BOUNDS,
      neighbors: NEIGHBORS,
    })
    expect(result.guides.some((guide) => guide.kind.startsWith('neighbor-'))).toBe(true)
    expect(NEIGHBORS[0]).toEqual({ id: 'focus', left: 300, top: 240, width: 240, height: 120 })
  })

  it('returns no stale guides once movement leaves every magnetic threshold', () => {
    const aligned = snapCanvasPosition({ pointer: { x: 502, y: 401 }, pointerOffset: { x: 100, y: 50 }, box: BOX, bounds: BOUNDS, neighbors: [] })
    const moved = snapCanvasPosition({ pointer: { x: 710, y: 590 }, pointerOffset: { x: 100, y: 50 }, box: BOX, bounds: BOUNDS, neighbors: [] })
    expect(aligned.guides.length).toBeGreaterThan(0)
    expect(moved.guides).toEqual([])
  })

  it('uses 8px Arrow movement and 1px Shift+Arrow movement', () => {
    expect(canvasKeyboardDelta('ArrowLeft', false)).toEqual({ x: -8, y: 0 })
    expect(canvasKeyboardDelta('ArrowDown', false)).toEqual({ x: 0, y: 8 })
    expect(canvasKeyboardDelta('ArrowRight', true)).toEqual({ x: 1, y: 0 })
    expect(canvasKeyboardDelta('Escape', false)).toBeNull()
  })
})
