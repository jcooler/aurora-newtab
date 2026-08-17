import type { CanvasProfileKey } from '../../lib/layout/canvasTypes'

export type ArrangeViewportMode = 'side' | 'sheet'

export interface ArrangeSize {
  width: number
  height: number
}

export const ARRANGE_SIDE_INSPECTOR_WIDTH = 328
export const ARRANGE_TOOLBAR_HEIGHT = 48
export const ARRANGE_WORKSPACE_PADDING = 12

export const ARRANGE_ARTBOARD_SIZES: Readonly<Record<CanvasProfileKey, ArrangeSize>> = Object.freeze({
  compact: Object.freeze({ width: 390, height: 844 }),
  standard: Object.freeze({ width: 1440, height: 900 }),
  display: Object.freeze({ width: 2560, height: 1440 }),
  ultrawide: Object.freeze({ width: 3440, height: 1440 }),
})

export function arrangeViewportMode(physicalWidth: number): ArrangeViewportMode {
  return Number.isFinite(physicalWidth) && physicalWidth >= 1100 ? 'side' : 'sheet'
}

export function arrangeArtboardSize(profile: CanvasProfileKey): ArrangeSize {
  return ARRANGE_ARTBOARD_SIZES[profile]
}

export function arrangeWorkspaceSize(
  physicalViewport: ArrangeSize,
  mode: ArrangeViewportMode,
  inspectorOpen: boolean,
): ArrangeSize {
  const inspectorWidth = mode === 'side' && inspectorOpen ? ARRANGE_SIDE_INSPECTOR_WIDTH : 0
  return {
    width: Math.max(1, physicalViewport.width - inspectorWidth - ARRANGE_WORKSPACE_PADDING * 2),
    height: Math.max(1, physicalViewport.height - ARRANGE_TOOLBAR_HEIGHT - ARRANGE_WORKSPACE_PADDING * 2),
  }
}

export function fitArrangeArtboard(logical: ArrangeSize, available: ArrangeSize): ArrangeSize & { scale: number } {
  const logicalWidth = Math.max(1, logical.width)
  const logicalHeight = Math.max(1, logical.height)
  const scale = Math.min(1, Math.max(1, available.width) / logicalWidth, Math.max(1, available.height) / logicalHeight)
  return {
    scale,
    width: logicalWidth * scale,
    height: logicalHeight * scale,
  }
}

export function clientToLogicalPoint(
  point: { x: number; y: number },
  origin: { left: number; top: number },
  scale: number,
): { x: number; y: number } {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  return {
    x: (point.x - origin.left) / safeScale,
    y: (point.y - origin.top) / safeScale,
  }
}
