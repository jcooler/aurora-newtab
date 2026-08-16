import { describe, expect, it } from 'vitest'
import {
  VIEWPORT_PANEL_GUTTER,
  anchorPanel,
  fitPanelSize,
  hugHorizontal,
  type PanelPlacement,
} from './anchor'

// `anchorPanel` returns `{left,top}` (opens downward) or `{left,bottom}`
// (opens upward) — these narrow the union so tests can assert on whichever
// field applies, and (by throwing on the wrong shape) double as an assertion
// that a given fixture landed in the branch the test expects.
function topOf(result: PanelPlacement): number {
  if (!('top' in result)) throw new Error('expected a top-anchored (downward) result')
  return result.top
}
function bottomOf(result: PanelPlacement): number {
  if (!('bottom' in result)) throw new Error('expected a bottom-anchored (upward) result')
  return result.bottom
}

describe('anchorPanel', () => {
  const viewport = { w: 1600, h: 900 }
  const panel = { w: 240, h: 160 }

  it('opens below-left when the pill is in the top-left quadrant', () => {
    const pillRect = { left: 100, top: 50, right: 180, bottom: 90, width: 80, height: 40 }
    const result = anchorPanel(pillRect, panel, viewport)
    expect(result.left).toBe(pillRect.left)
    expect(topOf(result)).toBe(pillRect.bottom + 8)
  })

  it('opens above-right when the pill is in the bottom-right quadrant — anchored via `bottom` (grow-up), not `top`', () => {
    const pillRect = { left: 1400, top: 800, right: 1480, bottom: 840, width: 80, height: 40 }
    const result = anchorPanel(pillRect, panel, viewport)
    expect(result.left).toBe(pillRect.right - panel.w)
    const bottom = bottomOf(result)
    expect(bottom).toBe(viewport.h - pillRect.top + 8)
    // Equivalent on-screen top edge to the OLD top-anchored math (proof this
    // is a pixel-identical re-anchoring at a size that never clips, not a
    // visual shift): viewport.h - bottom - panel.h === the old rawTop.
    const oldTop = pillRect.top - 8 - panel.h
    expect(viewport.h - bottom - panel.h).toBe(oldTop)
  })

  it('opens below-right when the pill is in the top-right quadrant', () => {
    const pillRect = { left: 1400, top: 50, right: 1480, bottom: 90, width: 80, height: 40 }
    const result = anchorPanel(pillRect, panel, viewport)
    expect(result.left).toBe(pillRect.right - panel.w)
    expect(topOf(result)).toBe(pillRect.bottom + 8)
  })

  it('opens above-left when the pill is in the bottom-left quadrant — anchored via `bottom` (grow-up), not `top`', () => {
    const pillRect = { left: 100, top: 800, right: 180, bottom: 840, width: 80, height: 40 }
    const result = anchorPanel(pillRect, panel, viewport)
    expect(result.left).toBe(pillRect.left)
    expect(bottomOf(result)).toBe(viewport.h - pillRect.top + 8)
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
    expect(topOf(result)).toBe(viewport.h - tallPanel.h - 8)
  })

  it('clamps bottom to the 8px margin from the top edge when the above placement would overflow', () => {
    // Pill in the bottom half (so this is the `bottom`-anchored branch) but
    // hugging the TOP of the viewport, with a panel tall enough that opening
    // upward from here would push its top past the screen edge.
    const pillRect = { left: 100, top: 460, right: 180, bottom: 468, width: 80, height: 8 }
    const tallPanel = { w: 240, h: 500 }
    const result = anchorPanel(pillRect, tallPanel, viewport)
    // Unclamped this would be viewport.h - pillRect.top + 8 = 448, well past
    // the max of viewport.h - tallPanel.h - 8 = 392.
    expect(bottomOf(result)).toBe(viewport.h - tallPanel.h - 8)
  })

  it('fits an over-wide preferred panel before clamping so both horizontal edges retain the shared gutter', () => {
    const fitted = fitPanelSize({ w: 384, h: 184 }, { w: 320, h: 568 })
    expect(VIEWPORT_PANEL_GUTTER).toBe(8)
    expect(fitted).toEqual({ w: 304, h: 184 })

    const result = anchorPanel(
      { left: 278, top: 510, right: 304, bottom: 548, width: 26, height: 38 },
      { w: 384, h: 184 },
      { w: 320, h: 568 },
    )
    expect(result.left).toBe(8)
  })

  it('fits the Notes preferred width to the 320px viewport contract', () => {
    expect(fitPanelSize({ w: 320, h: 256 }, { w: 320, h: 568 })).toEqual({ w: 304, h: 256 })
  })

  it('fits an over-tall preferred panel and never returns a negative top or bottom offset', () => {
    expect(fitPanelSize({ w: 256, h: 218 }, { w: 320, h: 180 })).toEqual({ w: 256, h: 164 })

    const top = anchorPanel(
      { left: 16, top: 8, right: 92, bottom: 46, width: 76, height: 38 },
      { w: 256, h: 218 },
      { w: 320, h: 180 },
    )
    expect(topOf(top)).toBe(8)

    const bottom = anchorPanel(
      { left: 228, top: 134, right: 304, bottom: 172, width: 76, height: 38 },
      { w: 320, h: 256 },
      { w: 320, h: 180 },
    )
    expect(bottomOf(bottom)).toBe(8)
  })

  it('keeps the established 1600x900 numeric anchors unchanged', () => {
    expect(anchorPanel(
      { left: 16, top: 16, right: 92, bottom: 54, width: 76, height: 38 },
      { w: 256, h: 218 },
      { w: 1600, h: 900 },
    )).toEqual({ left: 16, top: 62 })
    expect(anchorPanel(
      { left: 1526, top: 846, right: 1584, bottom: 884, width: 58, height: 38 },
      { w: 384, h: 184 },
      { w: 1600, h: 900 },
    )).toEqual({ left: 1200, bottom: 62 })
  })

  it('fits and anchors an upward-growing panel above an exact tall-Dock boundary', () => {
    const viewport = { w: 800, h: 450 }
    const dockTop = 242
    const result = anchorPanel(
      { left: 680, top: 260, right: 752, bottom: 298, width: 72, height: 38 },
      { w: 384, h: 324 },
      viewport,
      dockTop,
    )

    expect(result).toEqual({ left: 368, bottom: 216, maxHeight: 226 })
    expect(viewport.h - bottomOf(result)).toBe(dockTop - VIEWPORT_PANEL_GUTTER)
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
