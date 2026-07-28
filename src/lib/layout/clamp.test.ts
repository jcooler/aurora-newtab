import { describe, expect, it } from 'vitest'
import { clampCenterPct } from './clamp'

describe('clampCenterPct', () => {
  const viewport = { w: 1600, h: 900 }
  const size = { w: 200, h: 100 }

  it('leaves an in-bounds center unchanged', () => {
    const result = clampCenterPct({ x: 50, y: 50 }, size, viewport)
    expect(result.x).toBeCloseTo(50)
    expect(result.y).toBeCloseTo(50)
  })

  it('clamps a top-left overflow to marginPx from each edge', () => {
    const result = clampCenterPct({ x: 1, y: 1 }, size, viewport)
    expect(result.x).toBeCloseTo(((200 / 2 + 8) / 1600) * 100)
    expect(result.y).toBeCloseTo(((100 / 2 + 8) / 900) * 100)
  })

  it('clamps a bottom-right overflow symmetrically', () => {
    const result = clampCenterPct({ x: 99, y: 99 }, size, viewport)
    expect(result.x).toBeCloseTo(((1600 - 200 / 2 - 8) / 1600) * 100)
    expect(result.y).toBeCloseTo(((900 - 100 / 2 - 8) / 900) * 100)
  })

  it('pins the x axis to viewport center when the block is wider than the viewport', () => {
    const result = clampCenterPct({ x: 1, y: 50 }, { w: 2000, h: 100 }, viewport)
    expect(result.x).toBeCloseTo(50)
  })

  it('respects a custom marginPx', () => {
    const result = clampCenterPct({ x: 1, y: 50 }, size, viewport, 20)
    expect(result.x).toBeCloseTo(((200 / 2 + 20) / 1600) * 100)
  })
})
