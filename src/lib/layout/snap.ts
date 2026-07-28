import type { BlockPos } from './types'
import type { Size } from './clamp'

export interface OtherRect { cxPx: number; cyPx: number; w: number; h: number }
export interface Guide { axis: 'v' | 'h'; pct: number } // v = vertical line at x-pct
export interface SnapResult { pos: BlockPos; guides: Guide[] }

interface AxisOther { centerPx: number; halfPx: number }
interface AxisCandidate { targetPx: number; guidePx: number; distance: number }

/** Nearest candidate (viewport center + others' centers/edges) within thresholdPx, or null. */
function pickAxisSnap(
  rawPx: number,
  halfSize: number,
  viewportPx: number,
  others: AxisOther[],
  thresholdPx: number,
): AxisCandidate | null {
  const candidates: AxisCandidate[] = []

  const vpCenter = viewportPx / 2
  candidates.push({ targetPx: vpCenter, guidePx: vpCenter, distance: Math.abs(rawPx - vpCenter) })

  for (const o of others) {
    candidates.push({ targetPx: o.centerPx, guidePx: o.centerPx, distance: Math.abs(rawPx - o.centerPx) })

    const left = o.centerPx - o.halfPx
    candidates.push({
      targetPx: left + halfSize,
      guidePx: left,
      distance: Math.abs(rawPx - halfSize - left),
    })

    const right = o.centerPx + o.halfPx
    candidates.push({
      targetPx: right - halfSize,
      guidePx: right,
      distance: Math.abs(rawPx + halfSize - right),
    })
  }

  let best: AxisCandidate | null = null
  for (const c of candidates) {
    if (c.distance <= thresholdPx && (!best || c.distance < best.distance)) best = c
  }
  return best
}

export function snapPosition(
  rawPct: BlockPos,
  size: Size,
  others: OtherRect[],
  viewport: Size,
  opts?: { gridPx?: number; thresholdPx?: number },
): SnapResult {
  const gridPx = opts?.gridPx ?? 8
  const thresholdPx = opts?.thresholdPx ?? 6

  const rawXPx = (rawPct.x / 100) * viewport.w
  const rawYPx = (rawPct.y / 100) * viewport.h

  const xOthers: AxisOther[] = others.map((o) => ({ centerPx: o.cxPx, halfPx: o.w / 2 }))
  const yOthers: AxisOther[] = others.map((o) => ({ centerPx: o.cyPx, halfPx: o.h / 2 }))

  const xSnap = pickAxisSnap(rawXPx, size.w / 2, viewport.w, xOthers, thresholdPx)
  const ySnap = pickAxisSnap(rawYPx, size.h / 2, viewport.h, yOthers, thresholdPx)

  const guides: Guide[] = []

  const xPx = xSnap ? xSnap.targetPx : Math.round(rawXPx / gridPx) * gridPx
  if (xSnap) guides.push({ axis: 'v', pct: (xSnap.guidePx / viewport.w) * 100 })

  const yPx = ySnap ? ySnap.targetPx : Math.round(rawYPx / gridPx) * gridPx
  if (ySnap) guides.push({ axis: 'h', pct: (ySnap.guidePx / viewport.h) * 100 })

  return {
    pos: { x: (xPx / viewport.w) * 100, y: (yPx / viewport.h) * 100 },
    guides,
  }
}
