import { describe, expect, it } from 'vitest'
import {
  DOCK_EDGE_INSET,
  DOCK_MAGNETIC_THRESHOLD,
  DOCK_SIDE_INSET,
  fallbackDockBandRect,
  nudgeDockPoint,
  snapDockPoint,
} from './dockGeometry'

const BAND = { left: 72, top: 16, width: 856, height: 100 }

describe('two-axis dock geometry', () => {
  it('derives the responsive transparent band from the approved insets and height clamp', () => {
    expect(DOCK_SIDE_INSET).toBe(72)
    expect(DOCK_EDGE_INSET).toBe(16)
    expect(DOCK_MAGNETIC_THRESHOLD).toBe(5)
    expect(fallbackDockBandRect('top', { width: 1000, height: 900 })).toEqual({
      left: 72, top: 16, width: 856, height: 128,
    })
    expect(fallbackDockBandRect('bottom', { width: 1000, height: 445 })).toEqual({
      left: 72, top: 333, width: 856, height: 96,
    })
  })

  it('clamps the live member box, not only its center', () => {
    const result = snapDockPoint({
      pointer: { x: -100, y: 999 },
      pointerOffsetRatio: { x: 0.5, y: 0.5 },
      member: { width: 200, height: 40 },
      band: BAND,
      neighbors: [],
      bypassMagnetism: false,
    })
    expect(result.point).toEqual({
      xPct: (200 / 2) / 856 * 100,
      yPct: (100 - 20) / 100 * 100,
    })
  })

  it('snaps both axes to the band center inside exactly 5px and clears beyond it', () => {
    const inside = snapDockPoint({
      pointer: { x: BAND.left + BAND.width / 2 + 5, y: BAND.top + BAND.height / 2 + 5 },
      pointerOffsetRatio: { x: 0.5, y: 0.5 },
      member: { width: 100, height: 20 },
      band: BAND,
      neighbors: [],
      bypassMagnetism: false,
    })
    expect(inside.point).toEqual({ xPct: 50, yPct: 50 })
    expect(inside.guides).toEqual([
      { axis: 'x', value: 428, kind: 'canvas-center' },
      { axis: 'y', value: 50, kind: 'canvas-center' },
    ])

    const outside = snapDockPoint({
      // Every moving edge/center is at least 5.01px beyond the band center.
      pointer: { x: BAND.left + BAND.width / 2 + 55.01, y: BAND.top + BAND.height / 2 + 15.01 },
      pointerOffsetRatio: { x: 0.5, y: 0.5 },
      member: { width: 100, height: 20 },
      band: BAND,
      neighbors: [],
      bypassMagnetism: false,
    })
    expect(outside.guides).toEqual([])
    expect(outside.point.xPct).not.toBe(50)
    expect(outside.point.yPct).not.toBe(50)
  })

  it('snaps both axes to peer edges at 5px and not at 5.01px', () => {
    const neighbor = { id: 'peer', left: BAND.left + 200, top: BAND.top + 80, width: 100, height: 10 }
    const inside = snapDockPoint({
      pointer: { x: BAND.left + 125, y: BAND.top + 65 },
      pointerOffsetRatio: { x: 0, y: 0 },
      member: { width: 80, height: 10 },
      band: BAND,
      neighbors: [neighbor],
      bypassMagnetism: false,
    })
    expect(inside.guides).toEqual([
      { axis: 'x', value: 200, kind: 'neighbor-edge', neighborId: 'peer' },
      { axis: 'y', value: 80, kind: 'neighbor-edge', neighborId: 'peer' },
    ])

    const outside = snapDockPoint({
      pointer: { x: BAND.left + 125.01, y: BAND.top + 64.99 },
      pointerOffsetRatio: { x: 0, y: 0 },
      member: { width: 80, height: 10 },
      band: BAND,
      neighbors: [neighbor],
      bypassMagnetism: false,
    })
    expect(outside.guides).toEqual([])
  })

  it('Alt bypass keeps the unsnapped continuous point but still clamps safety', () => {
    const result = snapDockPoint({
      pointer: { x: BAND.left + BAND.width / 2 + 3.25, y: BAND.top - 200 },
      pointerOffsetRatio: { x: 0.5, y: 0.5 },
      member: { width: 100, height: 20 },
      band: BAND,
      neighbors: [],
      bypassMagnetism: true,
    })
    expect(result.guides).toEqual([])
    expect(result.point.xPct).toBe((BAND.width / 2 + 3.25) / BAND.width * 100)
    expect(result.point.yPct).toBe(10)
  })

  it('converts 8px and 1px keyboard movement through the same measured clamp', () => {
    const member = { left: BAND.left + 200, top: BAND.top + 30, width: 100, height: 20 }
    const eight = nudgeDockPoint({ memberRect: member, band: BAND, delta: { x: 8, y: -8 } })
    const one = nudgeDockPoint({ memberRect: member, band: BAND, delta: { x: 1, y: 1 } })
    expect(eight).toEqual({ xPct: 258 / 856 * 100, yPct: 32 })
    expect(one).toEqual({ xPct: 251 / 856 * 100, yPct: 41 })

    expect(nudgeDockPoint({
      memberRect: { left: BAND.left, top: BAND.top, width: 100, height: 20 },
      band: BAND,
      delta: { x: -8, y: -8 },
    })).toEqual({ xPct: 50 / 856 * 100, yPct: 10 })
    expect(nudgeDockPoint({
      memberRect: { left: BAND.left + BAND.width - 100, top: BAND.top + BAND.height - 20, width: 100, height: 20 },
      band: BAND,
      delta: { x: 8, y: 8 },
    })).toEqual({ xPct: (BAND.width - 50) / BAND.width * 100, yPct: 90 })
  })
})
