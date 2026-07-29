import { describe, expect, it } from 'vitest'
import { choosePillAnchor, pillAnchorRect, type Rect } from './pillPlacement'

describe('pillAnchorRect', () => {
  const viewport = { w: 1600, h: 900 }
  const pill = { w: 200, h: 48 }

  it('bottom-center sits centered horizontally, 16px from the bottom edge', () => {
    const rect = pillAnchorRect('bottom-center', pill, viewport)
    expect(rect.left).toBe((1600 - 200) / 2)
    expect(rect.right).toBe(rect.left + 200)
    expect(rect.bottom).toBe(900 - 16)
    expect(rect.top).toBe(rect.bottom - 48)
  })

  it('above-bottom-center sits centered horizontally, one pill-height (+ gap) above bottom-center', () => {
    const rect = pillAnchorRect('above-bottom-center', pill, viewport)
    const base = pillAnchorRect('bottom-center', pill, viewport)
    expect(rect.left).toBe(base.left) // same horizontal centering
    expect(rect.bottom).toBe(base.top - 32) // gap above bottom-center's own top edge, wide enough to clear the 12px collision padding on both sides
    expect(rect.top).toBe(rect.bottom - 48)
  })

  it('top-center sits centered horizontally, 16px from the top edge', () => {
    const rect = pillAnchorRect('top-center', pill, viewport)
    expect(rect.left).toBe((1600 - 200) / 2)
    expect(rect.top).toBe(16)
    expect(rect.bottom).toBe(16 + 48)
  })

  it('bottom-left sits 16px from the left AND bottom edges', () => {
    const rect = pillAnchorRect('bottom-left', pill, viewport)
    expect(rect.left).toBe(16)
    expect(rect.bottom).toBe(900 - 16)
    expect(rect.top).toBe(rect.bottom - 48)
  })
})

describe('choosePillAnchor', () => {
  const viewport = { w: 1600, h: 900 }
  const pill = { w: 200, h: 48 }

  it('picks bottom-center (the default) when nothing is anywhere near it', () => {
    const blocks: Rect[] = [{ left: 0, top: 0, right: 100, bottom: 100 }] // far corner, top-left
    expect(choosePillAnchor(pill, blocks, viewport)).toBe('bottom-center')
  })

  it('picks bottom-center when there are no blocks at all', () => {
    expect(choosePillAnchor(pill, [], viewport)).toBe('bottom-center')
  })

  it('falls through to above-bottom-center when a block covers the default bottom-center spot', () => {
    const bottomCenter = pillAnchorRect('bottom-center', pill, viewport)
    const blocks: Rect[] = [
      { left: bottomCenter.left, top: bottomCenter.top, right: bottomCenter.right, bottom: bottomCenter.bottom },
    ]
    expect(choosePillAnchor(pill, blocks, viewport)).toBe('above-bottom-center')
  })

  it('falls through to top-center when both bottom-center and above-bottom-center are covered', () => {
    const bottomCenter = pillAnchorRect('bottom-center', pill, viewport)
    const aboveBottomCenter = pillAnchorRect('above-bottom-center', pill, viewport)
    // One tall block spanning both candidate boxes.
    const blocks: Rect[] = [
      {
        left: bottomCenter.left,
        top: aboveBottomCenter.top,
        right: bottomCenter.right,
        bottom: bottomCenter.bottom,
      },
    ]
    expect(choosePillAnchor(pill, blocks, viewport)).toBe('top-center')
  })

  it('falls through to bottom-left when bottom-center, above-bottom-center, AND top-center are all covered', () => {
    // A single full-height, full-center-column block covers all three
    // center-column candidates in one shot.
    const blocks: Rect[] = [{ left: 700, top: 0, right: 900, bottom: 900 }]
    expect(choosePillAnchor(pill, blocks, viewport)).toBe('bottom-left')
  })

  it('falls back to bottom-center (the default) when every candidate collides', () => {
    // Full-viewport block: nothing can possibly be clear.
    const blocks: Rect[] = [{ left: 0, top: 0, right: 1600, bottom: 900 }]
    expect(choosePillAnchor(pill, blocks, viewport)).toBe('bottom-center')
  })

  it('treats a near-miss within the ~12px padding as a collision', () => {
    const bottomCenter = pillAnchorRect('bottom-center', pill, viewport)
    // Sits 6px below the pill's bottom edge — clear of the RAW rect, but
    // within the ~12px collision padding the brief calls for.
    const blocks: Rect[] = [
      { left: bottomCenter.left, top: bottomCenter.bottom + 6, right: bottomCenter.right, bottom: bottomCenter.bottom + 60 },
    ]
    expect(choosePillAnchor(pill, blocks, viewport)).toBe('above-bottom-center')
  })

  it('does not treat a block safely outside the padding as a collision', () => {
    const bottomCenter = pillAnchorRect('bottom-center', pill, viewport)
    // 20px clear of the pill's bottom edge — outside the ~12px padding.
    const blocks: Rect[] = [
      { left: bottomCenter.left, top: bottomCenter.bottom + 20, right: bottomCenter.right, bottom: bottomCenter.bottom + 60 },
    ]
    expect(choosePillAnchor(pill, blocks, viewport)).toBe('bottom-center')
  })

  it('is deterministic: the same inputs always return the same anchor', () => {
    const blocks: Rect[] = [{ left: 700, top: 800, right: 900, bottom: 900 }]
    const first = choosePillAnchor(pill, blocks, viewport)
    const second = choosePillAnchor(pill, blocks, viewport)
    expect(first).toBe(second)
  })
})
