import { describe, expect, it } from 'vitest'
import { anchorPanel, hugHorizontal } from './anchor'

describe('anchorPanel', () => {
  const viewport = { w: 1600, h: 900 }
  const panel = { w: 240, h: 160 }

  it('opens below-left when the pill is in the top-left quadrant', () => {
    const pillRect = { left: 100, top: 50, right: 180, bottom: 90, width: 80, height: 40 }
    const result = anchorPanel(pillRect, panel, viewport)
    expect(result.left).toBe(pillRect.left)
    expect(result.top).toBe(pillRect.bottom + 8)
  })

  it('opens above-right when the pill is in the bottom-right quadrant', () => {
    const pillRect = { left: 1400, top: 800, right: 1480, bottom: 840, width: 80, height: 40 }
    const result = anchorPanel(pillRect, panel, viewport)
    expect(result.left).toBe(pillRect.right - panel.w)
    expect(result.top).toBe(pillRect.top - 8 - panel.h)
  })

  it('opens below-right when the pill is in the top-right quadrant', () => {
    const pillRect = { left: 1400, top: 50, right: 1480, bottom: 90, width: 80, height: 40 }
    const result = anchorPanel(pillRect, panel, viewport)
    expect(result.left).toBe(pillRect.right - panel.w)
    expect(result.top).toBe(pillRect.bottom + 8)
  })

  it('opens above-left when the pill is in the bottom-left quadrant', () => {
    const pillRect = { left: 100, top: 800, right: 180, bottom: 840, width: 80, height: 40 }
    const result = anchorPanel(pillRect, panel, viewport)
    expect(result.left).toBe(pillRect.left)
    expect(result.top).toBe(pillRect.top - 8 - panel.h)
  })

  it('clamps left to the 8px margin when the pill hugs the left edge', () => {
    const pillRect = { left: 2, top: 50, right: 40, bottom: 90, width: 38, height: 40 }
    const result = anchorPanel(pillRect, panel, viewport)
    expect(result.left).toBe(8)
  })

  it('clamps right-aligned left to the 8px margin from the right edge when the pill hugs the right edge', () => {
    const pillRect = { left: 1560, top: 50, right: 1598, bottom: 90, width: 38, height: 40 }
    const result = anchorPanel(pillRect, panel, viewport)
    expect(result.left).toBe(viewport.w - panel.w - 8)
  })

  it('clamps top to the 8px margin from the bottom edge when the below placement would overflow', () => {
    const pillRect = { left: 100, top: 440, right: 180, bottom: 448, width: 80, height: 8 }
    const tallPanel = { w: 240, h: 500 }
    const result = anchorPanel(pillRect, tallPanel, viewport)
    expect(result.top).toBe(viewport.h - tallPanel.h - 8)
  })
})

describe('hugHorizontal', () => {
  const viewportW = 1600

  it('shifts left (negative) when the pill center is in the left half', () => {
    const rect = { left: 64, top: 846, right: 127, bottom: 884, width: 63, height: 38 }
    const result = hugHorizontal(rect, 48, viewportW)
    expect(result.left).toBe(16)
    expect(result.right).toBe(79)
    expect(result.top).toBe(846) // vertical fields pass through unchanged
    expect(result.bottom).toBe(884)
    expect(result.width).toBe(63)
    expect(result.height).toBe(38)
  })

  it('shifts right (positive) when the pill center is in the right half — the mirror image, not a hardcoded sign', () => {
    const rect = { left: 1478, top: 846, right: 1536, bottom: 884, width: 58, height: 38 }
    const result = hugHorizontal(rect, 48, viewportW)
    expect(result.left).toBe(1526)
    expect(result.right).toBe(1584)
  })

  it('is a mirror-image function: hugging a rect and its horizontal mirror produces mirrored output', () => {
    const left = { left: 100, top: 10, right: 180, bottom: 50, width: 80, height: 40 }
    const mirroredRight = { left: viewportW - 180, top: 10, right: viewportW - 100, bottom: 50, width: 80, height: 40 }
    const huggedLeft = hugHorizontal(left, 48, viewportW)
    const huggedRight = hugHorizontal(mirroredRight, 48, viewportW)
    expect(huggedRight.left).toBe(viewportW - huggedLeft.right)
    expect(huggedRight.right).toBe(viewportW - huggedLeft.left)
  })
})
