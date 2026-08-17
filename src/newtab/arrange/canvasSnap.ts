import type { BlockId } from '../../lib/layout/types'

export interface CanvasPoint {
  x: number
  y: number
}

export interface CanvasSnapBox {
  width: number
  height: number
}

export interface CanvasSnapBounds extends CanvasSnapBox {
  inset?: number
}

export interface SnapNeighbor extends CanvasSnapBox {
  id: BlockId
  left: number
  top: number
}

export interface CanvasGuide {
  axis: 'x' | 'y'
  value: number
  kind: 'canvas-center' | 'neighbor-edge' | 'neighbor-center'
  neighborId?: BlockId
}

export interface CanvasSnapResult {
  left: number
  top: number
  guides: readonly CanvasGuide[]
}

interface SnapCanvasPositionInput {
  pointer: CanvasPoint
  pointerOffset: CanvasPoint
  box: CanvasSnapBox
  bounds: CanvasSnapBounds
  neighbors: readonly SnapNeighbor[]
  grid?: number
  magneticThreshold?: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}

export function clampCanvasTopLeft(
  position: Readonly<{ left: number; top: number }>,
  box: CanvasSnapBox,
  bounds: CanvasSnapBounds,
): { left: number; top: number } {
  const inset = bounds.inset ?? 8
  return {
    left: clamp(position.left, inset, bounds.width - inset - box.width),
    top: clamp(position.top, inset, bounds.height - inset - box.height),
  }
}

function nearestAxisGuide(
  axis: 'x' | 'y',
  start: number,
  extent: number,
  boundsExtent: number,
  neighbors: readonly SnapNeighbor[],
  threshold: number,
): { start: number; guide: CanvasGuide } | null {
  const moving = [start, start + extent / 2, start + extent]
  const candidates: Array<{ distance: number; start: number; guide: CanvasGuide }> = []
  const canvasCenter = boundsExtent / 2
  for (const [index, point] of moving.entries()) {
    const distance = Math.abs(point - canvasCenter)
    if (distance <= threshold) {
      candidates.push({
        distance,
        start: start + canvasCenter - point,
        guide: { axis, value: canvasCenter, kind: 'canvas-center' },
      })
    }
    for (const neighbor of neighbors) {
      const neighborStart = axis === 'x' ? neighbor.left : neighbor.top
      const neighborExtent = axis === 'x' ? neighbor.width : neighbor.height
      for (const [neighborIndex, target] of [neighborStart, neighborStart + neighborExtent / 2, neighborStart + neighborExtent].entries()) {
        const nextDistance = Math.abs(point - target)
        if (nextDistance > threshold) continue
        candidates.push({
          distance: nextDistance,
          start: start + target - point,
          guide: {
            axis,
            value: target,
            kind: index === 1 && neighborIndex === 1 ? 'neighbor-center' : 'neighbor-edge',
            neighborId: neighbor.id,
          },
        })
      }
    }
  }
  candidates.sort((left, right) => left.distance - right.distance
    || (left.guide.kind === 'canvas-center' ? -1 : 1))
  return candidates[0] ?? null
}

export function snapCanvasPosition({
  pointer,
  pointerOffset,
  box,
  bounds,
  neighbors,
  grid = 8,
  magneticThreshold = 6,
}: SnapCanvasPositionInput): CanvasSnapResult {
  const rawLeft = pointer.x - pointerOffset.x
  const rawTop = pointer.y - pointerOffset.y
  const xGuide = nearestAxisGuide('x', rawLeft, box.width, bounds.width, neighbors, magneticThreshold)
  const yGuide = nearestAxisGuide('y', rawTop, box.height, bounds.height, neighbors, magneticThreshold)
  const gridLeft = Math.round(rawLeft / grid) * grid
  const gridTop = Math.round(rawTop / grid) * grid
  const { left, top } = clampCanvasTopLeft(
    { left: xGuide?.start ?? gridLeft, top: yGuide?.start ?? gridTop },
    box,
    bounds,
  )
  return {
    left,
    top,
    guides: [xGuide?.guide, yGuide?.guide].filter((guide): guide is CanvasGuide => Boolean(guide)),
  }
}

export function canvasKeyboardDelta(key: string, fine: boolean): CanvasPoint | null {
  const distance = fine ? 1 : 8
  if (key === 'ArrowLeft') return { x: -distance, y: 0 }
  if (key === 'ArrowRight') return { x: distance, y: 0 }
  if (key === 'ArrowUp') return { x: 0, y: -distance }
  if (key === 'ArrowDown') return { x: 0, y: distance }
  return null
}
