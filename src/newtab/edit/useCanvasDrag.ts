import { useCallback, useRef, useState } from 'react'
import {
  snapCanvasPosition,
  type CanvasGuide,
  type SnapNeighbor,
} from '../arrange/canvasSnap'
import type { DockEdge } from '../../lib/layout/namedLayouts'
import type { BlockId } from '../../lib/layout/types'

/** Dragging within this many CSS px of the surface's top/bottom edge offers
 *  the dock drop zone (named-layouts spec 2.5). */
export const DOCK_ZONE_THRESHOLD = 56

export interface CanvasDragApi {
  dragging: BlockId | null
  guides: readonly CanvasGuide[]
  startDrag: (id: BlockId, e: { clientX: number; clientY: number; pointerId: number }) => void
}

/** Pointer-capture drag for the live edit session (named-layouts spec 2.5),
 *  reusing the retained snap machinery: 8px grid, magnetic guides at 6px,
 *  safe-margin clamping inside the surface. The final position is reported
 *  as a CENTER percent so the session re-anchors it exactly. One undo entry
 *  per drag: the first move reports `first: true` (the caller pushes), the
 *  stream reports `false` (the caller uses moveSelectedLive). */
export function useCanvasDrag(input: {
  getSurface: () => HTMLElement | null
  getItemRects: () => ReadonlyMap<BlockId, DOMRectReadOnly>
  onPreviewMove: (id: BlockId, point: { xPct: number; yPct: number }, first: boolean) => void
  onZoneChange?: (zone: DockEdge | null) => void
  onDrop: (context: { zone: DockEdge | null; pointerX: number }) => void
  /** Dock eligibility (spec 2.3: a widget without a Docked tier has no
   *  honest strip form). A widget this predicate rejects is never offered a
   *  dock zone — its edge drop is an ordinary free placement. Omitted =
   *  every widget dockable. */
  canDock?: (id: BlockId) => boolean
}): CanvasDragApi {
  const [dragging, setDragging] = useState<BlockId | null>(null)
  const [guides, setGuides] = useState<readonly CanvasGuide[]>([])
  const inputRef = useRef(input)
  inputRef.current = input

  const startDrag = useCallback((id: BlockId, start: { clientX: number; clientY: number; pointerId: number }) => {
    const surface = inputRef.current.getSurface()
    const itemRect = inputRef.current.getItemRects().get(id)
    if (!surface || !itemRect) return
    const surfaceRect = surface.getBoundingClientRect()
    const pointerOffset = {
      x: start.clientX - itemRect.left,
      y: start.clientY - itemRect.top,
    }
    const box = { width: itemRect.width, height: itemRect.height }
    let moved = false
    let zone: DockEdge | null = null
    let lastPointerX = start.clientX

    const setZone = (next: DockEdge | null) => {
      if (next === zone) return
      zone = next
      inputRef.current.onZoneChange?.(next)
    }

    try {
      surface.setPointerCapture?.(start.pointerId)
    } catch {
      // jsdom and detached surfaces: capture is an enhancement, not a
      // requirement — move/up listeners below still complete the drag.
    }

    const dockable = inputRef.current.canDock?.(id) ?? true

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== start.pointerId) return
      lastPointerX = event.clientX
      const surfaceY = event.clientY - surfaceRect.top
      setZone(
        !dockable
          ? null
          : surfaceY < DOCK_ZONE_THRESHOLD
            ? 'top'
            : surfaceY > surfaceRect.height - DOCK_ZONE_THRESHOLD
              ? 'bottom'
              : null,
      )
      const bounds = { width: surfaceRect.width, height: surfaceRect.height, inset: 8 }
      const neighbors: SnapNeighbor[] = []
      for (const [neighborId, rect] of inputRef.current.getItemRects()) {
        if (neighborId === id) continue
        neighbors.push({
          id: neighborId,
          left: rect.left - surfaceRect.left,
          top: rect.top - surfaceRect.top,
          width: rect.width,
          height: rect.height,
        })
      }
      const snapped = snapCanvasPosition({
        pointer: { x: event.clientX - surfaceRect.left, y: event.clientY - surfaceRect.top },
        pointerOffset,
        box,
        bounds,
        neighbors,
      })
      setGuides(snapped.guides)
      const first = !moved
      moved = true
      inputRef.current.onPreviewMove(id, {
        xPct: (snapped.left + box.width / 2) / surfaceRect.width * 100,
        yPct: (snapped.top + box.height / 2) / surfaceRect.height * 100,
      }, first)
    }

    const finish = (event: PointerEvent) => {
      if (event.pointerId !== start.pointerId) return
      surface.removeEventListener('pointermove', onMove)
      surface.removeEventListener('pointerup', finish)
      surface.removeEventListener('pointercancel', finish)
      try {
        surface.releasePointerCapture?.(start.pointerId)
      } catch {
        // released or never captured — nothing to undo
      }
      setDragging(null)
      setGuides([])
      const droppedZone = zone
      setZone(null)
      inputRef.current.onDrop({ zone: droppedZone, pointerX: lastPointerX })
    }

    surface.addEventListener('pointermove', onMove)
    surface.addEventListener('pointerup', finish)
    surface.addEventListener('pointercancel', finish)
    setDragging(id)
  }, [])

  return { dragging, guides, startDrag }
}
