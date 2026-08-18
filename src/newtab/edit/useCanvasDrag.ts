import { useCallback, useRef, useState } from 'react'
import {
  snapCanvasPosition,
  type CanvasGuide,
  type SnapNeighbor,
} from '../arrange/canvasSnap'
import type { BlockId } from '../../lib/layout/types'

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
  onDrop: () => void
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

    try {
      surface.setPointerCapture?.(start.pointerId)
    } catch {
      // jsdom and detached surfaces: capture is an enhancement, not a
      // requirement — move/up listeners below still complete the drag.
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== start.pointerId) return
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
      inputRef.current.onDrop()
    }

    surface.addEventListener('pointermove', onMove)
    surface.addEventListener('pointerup', finish)
    surface.addEventListener('pointercancel', finish)
    setDragging(id)
  }, [])

  return { dragging, guides, startDrag }
}
