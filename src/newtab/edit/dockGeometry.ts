import type { DockEdge, DockPoint } from '../../lib/layout/namedLayouts'
import type { CanvasGuide } from '../arrange/canvasSnap'

export const DOCK_SIDE_INSET = 5
export const DOCK_EDGE_INSET = 5
export const DOCK_MAGNETIC_THRESHOLD = 5

const DOCK_MIN_HEIGHT = 96
const DOCK_MAX_HEIGHT = 128
const DOCK_VIEWPORT_HEIGHT_RATIO = 0.16

export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

export interface DockSnapNeighbor extends RectLike {
  id: string
}

interface AxisCandidate {
  distance: number
  start: number
  priority: number
  guide: CanvasGuide
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(minimum, value), Math.max(minimum, maximum))
}

function dockHeight(viewportHeight: number): number {
  return clamp(
    viewportHeight * DOCK_VIEWPORT_HEIGHT_RATIO,
    DOCK_MIN_HEIGHT,
    DOCK_MAX_HEIGHT,
  )
}

export function fallbackDockBandRect(
  edge: DockEdge,
  viewport: Readonly<{ width: number; height: number }>,
): RectLike {
  const height = dockHeight(viewport.height)
  return {
    left: DOCK_SIDE_INSET,
    top: edge === 'top'
      ? DOCK_EDGE_INSET
      : viewport.height - DOCK_EDGE_INSET - height,
    width: Math.max(0, viewport.width - DOCK_SIDE_INSET * 2),
    height,
  }
}

function nearestAxisGuide(
  axis: 'x' | 'y',
  start: number,
  extent: number,
  bandExtent: number,
  bandOrigin: number,
  neighbors: readonly DockSnapNeighbor[],
): AxisCandidate | null {
  const moving = [start, start + extent / 2, start + extent]
  const candidates: AxisCandidate[] = []
  const center = bandExtent / 2

  for (const [movingIndex, point] of moving.entries()) {
    const distance = Math.abs(point - center)
    if (distance <= DOCK_MAGNETIC_THRESHOLD) {
      candidates.push({
        distance,
        start: start + center - point,
        // Center-to-center is the least surprising equal-distance band
        // alignment; every band-center candidate still outranks a peer tie.
        priority: movingIndex === 1 ? 0 : 1,
        guide: { axis, value: center, kind: 'canvas-center' },
      })
    }
  }

  for (const neighbor of neighbors) {
    const neighborStart = (axis === 'x' ? neighbor.left : neighbor.top) - bandOrigin
    const neighborExtent = axis === 'x' ? neighbor.width : neighbor.height
    const targets = [neighborStart, neighborStart + neighborExtent / 2, neighborStart + neighborExtent]
    for (const [movingIndex, point] of moving.entries()) {
      for (const [targetIndex, target] of targets.entries()) {
        const distance = Math.abs(point - target)
        if (distance > DOCK_MAGNETIC_THRESHOLD) continue
        candidates.push({
          distance,
          start: start + target - point,
          priority: 2,
          guide: {
            axis,
            value: target,
            kind: movingIndex === 1 && targetIndex === 1 ? 'neighbor-center' : 'neighbor-edge',
            neighborId: neighbor.id,
          },
        })
      }
    }
  }

  candidates.sort((left, right) => left.distance - right.distance || left.priority - right.priority)
  return candidates[0] ?? null
}

function pointFromTopLeft(
  left: number,
  top: number,
  member: Readonly<{ width: number; height: number }>,
  band: Readonly<RectLike>,
): DockPoint {
  return {
    xPct: band.width > 0 ? (left + member.width / 2) / band.width * 100 : 50,
    yPct: band.height > 0 ? (top + member.height / 2) / band.height * 100 : 50,
  }
}

export function snapDockPoint(input: Readonly<{
  pointer: { x: number; y: number }
  pointerOffsetRatio: { x: number; y: number }
  member: { width: number; height: number }
  band: RectLike
  neighbors: readonly DockSnapNeighbor[]
  bypassMagnetism: boolean
}>): { point: DockPoint; guides: readonly CanvasGuide[] } {
  const { pointer, pointerOffsetRatio, member, band, neighbors, bypassMagnetism } = input
  const rawLeft = pointer.x - band.left - pointerOffsetRatio.x * member.width
  const rawTop = pointer.y - band.top - pointerOffsetRatio.y * member.height
  const xGuide = bypassMagnetism
    ? null
    : nearestAxisGuide('x', rawLeft, member.width, band.width, band.left, neighbors)
  const yGuide = bypassMagnetism
    ? null
    : nearestAxisGuide('y', rawTop, member.height, band.height, band.top, neighbors)
  const guidedLeft = xGuide?.start ?? rawLeft
  const guidedTop = yGuide?.start ?? rawTop
  const left = clamp(guidedLeft, 0, band.width - member.width)
  const top = clamp(guidedTop, 0, band.height - member.height)

  // A safety clamp can invalidate an otherwise close alignment. Never leave
  // a stale blue guide on screen for geometry that was not actually applied.
  const guides = [
    xGuide && Math.abs(left - guidedLeft) < 0.001 ? xGuide.guide : null,
    yGuide && Math.abs(top - guidedTop) < 0.001 ? yGuide.guide : null,
  ].filter((guide): guide is CanvasGuide => guide !== null)

  return { point: pointFromTopLeft(left, top, member, band), guides }
}

export function nudgeDockPoint(input: Readonly<{
  memberRect: RectLike
  band: RectLike
  delta: { x: number; y: number }
}>): DockPoint {
  const { memberRect, band, delta } = input
  const left = clamp(
    memberRect.left - band.left + delta.x,
    0,
    band.width - memberRect.width,
  )
  const top = clamp(
    memberRect.top - band.top + delta.y,
    0,
    band.height - memberRect.height,
  )
  return pointFromTopLeft(left, top, memberRect, band)
}
