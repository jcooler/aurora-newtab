import type { BlockPos } from './types'

export interface Size { w: number; h: number }

function clampAxis(pct: number, sizePx: number, viewportPx: number, marginPx: number): number {
  const half = sizePx / 2
  const minPx = half + marginPx
  const maxPx = viewportPx - half - marginPx
  if (minPx > maxPx) {
    // Degenerate: the block (plus margins) doesn't fit on this axis — pin to center.
    return 50
  }
  const px = (pct / 100) * viewportPx
  const clampedPx = Math.min(Math.max(px, minPx), maxPx)
  return (clampedPx / viewportPx) * 100
}

/** Clamp a percent-center so the block's box keeps >= marginPx from every viewport edge.
 *  Degenerate case (block bigger than viewport): pin to viewport center on that axis. */
export function clampCenterPct(pos: BlockPos, size: Size, viewport: Size, marginPx = 8): BlockPos {
  return {
    x: clampAxis(pos.x, size.w, viewport.w, marginPx),
    y: clampAxis(pos.y, size.h, viewport.h, marginPx),
  }
}
