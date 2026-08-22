import { useCallback, useEffect, useRef, useState } from 'react'
import {
  snapCanvasPosition,
  type CanvasGuide,
  type SnapNeighbor,
} from '../arrange/canvasSnap'
import type { DockEdge } from '../../lib/layout/namedLayouts'
import type { StackDropTarget } from '../../lib/layout/stacks'
import { BLOCK_IDS, type BlockId } from '../../lib/layout/types'

/** Dragging within this many CSS px of the surface's top/bottom edge offers
 *  the dock drop zone (named-layouts spec 2.5). */
export const DOCK_ZONE_THRESHOLD = 56
export const STACK_HOLD_MS = 500

export type CanvasDragSubject =
  | Readonly<{ kind: 'widget'; id: BlockId }>
  | Readonly<{ kind: 'stack'; id: string }>
  | Readonly<{ kind: 'stack-member'; stackId: string; id: BlockId }>

export interface CanvasDragDrop {
  zone: DockEdge | null
  pointerX: number
  point: { xPct: number; yPct: number }
  stackTarget: StackDropTarget | null
}

export interface CanvasDragApi {
  dragging: CanvasDragSubject | null
  stackTarget: StackDropTarget | null
  guides: readonly CanvasGuide[]
  startDrag: (
    subject: CanvasDragSubject,
    event: { clientX: number; clientY: number; pointerId: number },
  ) => void
}

function objectKey(subject: CanvasDragSubject): string {
  return subject.kind === 'widget' ? subject.id : `stack:${subject.kind === 'stack' ? subject.id : subject.stackId}`
}

function targetFromKey(key: string): StackDropTarget | null {
  if (key.startsWith('stack:')) return { kind: 'stack', id: key.slice('stack:'.length) }
  return BLOCK_IDS.includes(key as BlockId) ? { kind: 'widget', id: key as BlockId } : null
}

/** Pointer-capture drag for standalone widgets, whole stacks, and inspector-
 *  origin stack members. A standalone widget becomes stack-eligible only
 *  after a continuous 500ms hold over one live object. Nothing guesses from
 *  overlap alone, and stack/member subjects can neither dock nor stack. */
export function useCanvasDrag(input: {
  getSurface: () => HTMLElement | null
  getItemRects: () => ReadonlyMap<string, DOMRectReadOnly>
  onPreviewMove: (
    subject: CanvasDragSubject,
    point: { xPct: number; yPct: number },
    first: boolean,
    drag: { zone: DockEdge | null; pointerX: number },
  ) => void
  onZoneChange?: (zone: DockEdge | null) => void
  onDrop: (context: CanvasDragDrop) => void
  onCancel?: (subject: CanvasDragSubject) => void
  canDock?: (id: BlockId) => boolean
  canStackTarget?: (sourceId: BlockId, target: StackDropTarget) => boolean
}): CanvasDragApi {
  const [dragging, setDragging] = useState<CanvasDragSubject | null>(null)
  const [stackTarget, setStackTarget] = useState<StackDropTarget | null>(null)
  const [guides, setGuides] = useState<readonly CanvasGuide[]>([])
  const inputRef = useRef(input)
  const activeCleanupRef = useRef<(() => void) | null>(null)
  inputRef.current = input

  useEffect(() => () => activeCleanupRef.current?.(), [])

  const startDrag = useCallback((
    subject: CanvasDragSubject,
    start: { clientX: number; clientY: number; pointerId: number },
  ) => {
    activeCleanupRef.current?.()
    const surface = inputRef.current.getSurface()
    const sourceKey = objectKey(subject)
    const itemRect = inputRef.current.getItemRects().get(sourceKey)
    if (!surface || !itemRect) return
    const surfaceRect = surface.getBoundingClientRect()
    const pointerOffset = subject.kind === 'stack-member'
      ? { x: itemRect.width / 2, y: itemRect.height / 2 }
      : { x: start.clientX - itemRect.left, y: start.clientY - itemRect.top }
    const box = { width: itemRect.width, height: itemRect.height }
    let moved = false
    let zone: DockEdge | null = null
    let lastPointerX = start.clientX
    let lastPoint = {
      xPct: (itemRect.left - surfaceRect.left + itemRect.width / 2) / surfaceRect.width * 100,
      yPct: (itemRect.top - surfaceRect.top + itemRect.height / 2) / surfaceRect.height * 100,
    }
    let holdTimer: number | null = null
    let candidateKey: string | null = null
    let markedTarget: StackDropTarget | null = null

    const clearStackHold = () => {
      if (holdTimer !== null) window.clearTimeout(holdTimer)
      holdTimer = null
      candidateKey = null
      markedTarget = null
      setStackTarget(null)
    }

    const setZone = (next: DockEdge | null) => {
      if (next === zone) return
      zone = next
      inputRef.current.onZoneChange?.(next)
    }

    const armStackHold = (target: StackDropTarget | null) => {
      if (subject.kind !== 'widget' || zone !== null || target === null) {
        clearStackHold()
        return
      }
      const nextKey = `${target.kind}:${target.id}`
      if (candidateKey === nextKey) return
      clearStackHold()
      candidateKey = nextKey
      holdTimer = window.setTimeout(() => {
        if (candidateKey !== nextKey || zone !== null) return
        markedTarget = target
        setStackTarget(target)
      }, STACK_HOLD_MS)
    }

    try {
      surface.setPointerCapture?.(start.pointerId)
    } catch {
      // Pointer capture is an enhancement. Document listeners below are the
      // correctness path, including drags that begin in the inspector.
    }

    const dockable = subject.kind === 'widget'
      ? inputRef.current.canDock?.(subject.id) ?? true
      : false

    const inStrip = (edge: DockEdge, clientY: number): boolean => {
      const bar = document.querySelector(edge === 'top' ? '.canvas-top-bar' : '.canvas-bottom-bar')
      if (!bar) return false
      const rect = bar.getBoundingClientRect()
      return clientY >= rect.top && clientY <= rect.bottom
    }

    const stackCandidateAt = (clientX: number, clientY: number): StackDropTarget | null => {
      if (subject.kind !== 'widget') return null
      for (const [key, rect] of inputRef.current.getItemRects()) {
        if (key === sourceKey) continue
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue
        const target = targetFromKey(key)
        if (!target) continue
        if (inputRef.current.canStackTarget?.(subject.id, target) === false) continue
        return target
      }
      return null
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== start.pointerId) return
      lastPointerX = event.clientX
      const surfaceY = event.clientY - surfaceRect.top
      setZone(
        !dockable
          ? null
          : surfaceY < DOCK_ZONE_THRESHOLD || inStrip('top', event.clientY)
            ? 'top'
            : surfaceY > surfaceRect.height - DOCK_ZONE_THRESHOLD || inStrip('bottom', event.clientY)
              ? 'bottom'
              : null,
      )
      armStackHold(zone === null ? stackCandidateAt(event.clientX, event.clientY) : null)

      const bounds = { width: surfaceRect.width, height: surfaceRect.height, inset: 8 }
      const neighbors: SnapNeighbor[] = []
      for (const [neighborId, rect] of inputRef.current.getItemRects()) {
        if (neighborId === sourceKey) continue
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
      lastPoint = {
        xPct: (snapped.left + box.width / 2) / surfaceRect.width * 100,
        yPct: (snapped.top + box.height / 2) / surfaceRect.height * 100,
      }
      const first = !moved
      moved = true
      inputRef.current.onPreviewMove(subject, lastPoint, first, { zone, pointerX: event.clientX })
    }

    const finish = (event: PointerEvent) => {
      if (event.pointerId !== start.pointerId) return
      const cancelled = event.type === 'pointercancel'
      const droppedZone = zone
      const droppedTarget = droppedZone !== null ? null : markedTarget
      removeListeners()
      setDragging(null)
      setGuides([])
      setStackTarget(null)
      candidateKey = null
      markedTarget = null
      setZone(null)
      if (cancelled) {
        inputRef.current.onCancel?.(subject)
        return
      }
      inputRef.current.onDrop({
        zone: droppedZone,
        pointerX: lastPointerX,
        point: lastPoint,
        stackTarget: droppedTarget,
      })
    }

    const removeListeners = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', finish)
      document.removeEventListener('pointercancel', finish)
      if (holdTimer !== null) window.clearTimeout(holdTimer)
      holdTimer = null
      try {
        surface.releasePointerCapture?.(start.pointerId)
      } catch {
        // Already released or never captured.
      }
      if (activeCleanupRef.current === removeListeners) activeCleanupRef.current = null
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', finish)
    document.addEventListener('pointercancel', finish)
    activeCleanupRef.current = removeListeners
    setDragging(subject)
    setStackTarget(null)
  }, [])

  return { dragging, stackTarget, guides, startDrag }
}
