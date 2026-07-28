import { describe, expect, it } from 'vitest'
import { snapPosition } from './snap'

describe('snapPosition', () => {
  const viewport = { w: 1600, h: 900 }
  const size = { w: 200, h: 100 }

  function pxToPct(px: number, viewportPx: number): number {
    return (px / viewportPx) * 100
  }

  it('snaps to the viewport center-x and emits a vertical guide when within threshold', () => {
    const raw = { x: pxToPct(800 + 5, 1600), y: pxToPct(273, 900) } // y far from any candidate
    const result = snapPosition(raw, size, [], viewport)
    expect(result.pos.x).toBeCloseTo(50)
    expect(result.guides).toContainEqual({ axis: 'v', pct: 50 })
    expect(result.guides).toHaveLength(1) // y has no candidate in range -> grid-rounds, no guide
  })

  it("snaps to another rect's center-y and emits a horizontal guide when within threshold", () => {
    const other = { cxPx: 300, cyPx: 500, w: 120, h: 60 }
    const raw = { x: pxToPct(37, 1600), y: pxToPct(500 - 4, 900) } // x far from any candidate
    const result = snapPosition(raw, size, [other], viewport)
    expect(result.pos.y).toBeCloseTo(pxToPct(500, 900))
    expect(result.guides).toContainEqual({ axis: 'h', pct: pxToPct(500, 900) })
    expect(result.guides).toHaveLength(1)
  })

  it('captures edge-to-edge: dragged left edge within threshold of another rect left edge', () => {
    // other: cxPx 700, w 300 -> left edge at 550, right edge at 850
    const other = { cxPx: 700, cyPx: 500, w: 300, h: 100 }
    // dragged half-width 100; want draggedLeft (rawXPx - 100) within 6px of 550 -> rawXPx = 653
    const raw = { x: pxToPct(653, 1600), y: pxToPct(21, 900) } // y far from any candidate
    const result = snapPosition(raw, size, [other], viewport)
    expect(result.pos.x).toBeCloseTo(pxToPct(650, 1600)) // snapped center = otherLeft(550) + halfW(100)
    expect(result.guides).toContainEqual({ axis: 'v', pct: pxToPct(550, 1600) })
  })

  it('grid-rounds an axis when no candidate is within threshold', () => {
    const raw = { x: pxToPct(403, 1600), y: pxToPct(21, 900) }
    const result = snapPosition(raw, size, [], viewport)
    expect(result.pos.x).toBeCloseTo(pxToPct(400, 1600)) // 403 rounds to nearest 8 -> 400
    expect(result.guides.find((g) => g.axis === 'v')).toBeUndefined()
  })

  it('lets a guide capture one axis while the other axis still grid-rounds', () => {
    const raw = { x: pxToPct(800 + 5, 1600), y: pxToPct(403, 900) }
    const result = snapPosition(raw, size, [], viewport)
    expect(result.pos.x).toBeCloseTo(50)
    expect(result.guides).toContainEqual({ axis: 'v', pct: 50 })
    expect(result.pos.y).toBeCloseTo(pxToPct(400, 900))
    expect(result.guides.find((g) => g.axis === 'h')).toBeUndefined()
  })

  it('emits guides on both axes when both are within threshold', () => {
    const raw = { x: pxToPct(800 + 5, 1600), y: pxToPct(450 - 4, 900) }
    const result = snapPosition(raw, size, [], viewport)
    expect(result.guides).toHaveLength(2)
    expect(result.guides).toContainEqual({ axis: 'v', pct: 50 })
    expect(result.guides).toContainEqual({ axis: 'h', pct: 50 })
  })

  it('overrides the default gridPx (8) via opts', () => {
    const raw = { x: pxToPct(407, 1600), y: pxToPct(21, 900) }
    const resultDefault = snapPosition(raw, size, [], viewport)
    const resultOverride = snapPosition(raw, size, [], viewport, { gridPx: 10 })
    expect(resultDefault.pos.x).toBeCloseTo(pxToPct(408, 1600)) // 407 -> nearest 8 -> 408
    expect(resultOverride.pos.x).toBeCloseTo(pxToPct(410, 1600)) // 407 -> nearest 10 -> 410
  })

  it('overrides the default thresholdPx (6) via opts', () => {
    const raw = { x: pxToPct(800 + 8, 1600), y: pxToPct(21, 900) } // 8px from viewport center-x
    const resultDefault = snapPosition(raw, size, [], viewport)
    const resultOverride = snapPosition(raw, size, [], viewport, { thresholdPx: 10 })
    expect(resultDefault.guides.find((g) => g.axis === 'v')).toBeUndefined()
    expect(resultOverride.guides).toContainEqual({ axis: 'v', pct: 50 })
  })
})
