import { useCallback, useEffect, useRef, useState } from 'react'
import type { DockEdge, DockPoint } from '../../lib/layout/namedLayouts'
import type { StackDropTarget } from '../../lib/layout/stacks'
import { BLOCK_IDS, type BlockId } from '../../lib/layout/types'
import {
  clampCanvasTopLeft,
  snapCanvasPosition,
  type SnapNeighbor,
} from '../arrange/canvasSnap'
import type { DragGuideSet } from '../canvas/CanvasSurface'
import {
  fallbackDockBandRect,
  snapDockPoint,
  type DockSnapNeighbor,
  type RectLike,
} from './dockGeometry'

export const STACK_HOLD_MS = 500

export type CanvasDragSubject =
  | Readonly<{ kind: 'widget'; id: BlockId }>
  | Readonly<{ kind: 'stack'; id: string }>
  | Readonly<{ kind: 'stack-member'; stackId: string; id: BlockId }>

export type DragPlacement =
  | Readonly<{ kind: 'canvas'; point: { xPct: number; yPct: number } }>
  | Readonly<{ kind: 'dock'; dock: DockEdge; point: DockPoint }>

export interface CanvasDragDrop {
  placement: DragPlacement
  stackTarget: StackDropTarget | null
}

export interface CanvasDragApi {
  dragging: CanvasDragSubject | null
  stackTarget: StackDropTarget | null
  guideSet: DragGuideSet | null
  startDrag: (
    subject: CanvasDragSubject,
    event: { clientX: number; clientY: number; pointerId: number },
  ) => void
  cancelDrag: () => void
}

function objectKey(subject: CanvasDragSubject): string {
  return subject.kind === 'widget'
    ? subject.id
    : `stack:${subject.kind === 'stack' ? subject.id : subject.stackId}`
}

function targetFromKey(key: string): StackDropTarget | null {
  if (key.startsWith('stack:')) return { kind: 'stack', id: key.slice('stack:'.length) }
  return BLOCK_IDS.includes(key as BlockId) ? { kind: 'widget', id: key as BlockId } : null
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function contains(rect: RectLike, clientX: number, clientY: number): boolean {
  return clientX >= rect.left
    && clientX <= rect.left + rect.width
    && clientY >= rect.top
    && clientY <= rect.top + rect.height
}

function bandRect(edge: DockEdge, surfaceRect: DOMRectReadOnly): RectLike {
  const bar = document.querySelector<HTMLElement>(
    edge === 'top' ? '.canvas-top-bar' : '.canvas-bottom-bar',
  )
  const measured = bar?.getBoundingClientRect()
  if (measured && measured.width > 0 && measured.height > 0) {
    return {
      left: measured.left,
      top: measured.top,
      width: measured.width,
      height: measured.height,
    }
  }
  const fallback = fallbackDockBandRect(edge, {
    width: surfaceRect.width,
    height: surfaceRect.height,
  })
  return {
    ...fallback,
    left: surfaceRect.left + fallback.left,
    top: surfaceRect.top + fallback.top,
  }
}

/** One pointer-capture state machine for free widgets, docked widgets, whole
 * stacks, and inspector-origin stack members. Placement space is explicit on
 * every preview, live member dimensions are re-read on every move, and every
 * cancellation path shares one exact teardown before notifying the caller. */
export function useCanvasDrag(input: {
  getSurface: () => HTMLElement | null
  getItemRects: () => ReadonlyMap<string, DOMRectReadOnly>
  onPreviewMove: (
    subject: CanvasDragSubject,
    placement: DragPlacement,
    first: boolean,
    pointer: { clientX: number; clientY: number; altKey: boolean },
  ) => void
  onZoneChange?: (zone: DockEdge | null) => void
  onDrop: (context: CanvasDragDrop) => void
  onCancel?: (subject: CanvasDragSubject) => void
  canDock?: (id: BlockId) => boolean
  canStackTarget?: (sourceId: BlockId, target: StackDropTarget) => boolean
}): CanvasDragApi {
  const [dragging, setDragging] = useState<CanvasDragSubject | null>(null)
  const [stackTarget, setStackTarget] = useState<StackDropTarget | null>(null)
  const [guideSet, setGuideSet] = useState<DragGuideSet | null>(null)
  const inputRef = useRef(input)
  const activeCancelRef = useRef<(() => void) | null>(null)
  inputRef.current = input

  useEffect(() => () => activeCancelRef.current?.(), [])

  const startDrag = useCallback((
    subject: CanvasDragSubject,
    start: { clientX: number; clientY: number; pointerId: number },
  ) => {
    // A second drag cannot strand the first drag's listeners or draft.
    activeCancelRef.current?.()
    const surface = inputRef.current.getSurface()
    const sourceKey = objectKey(subject)
    const startRect = inputRef.current.getItemRects().get(sourceKey)
    if (!surface || !startRect) return
    const dragSurface = surface
    const originRect = startRect

    const pointerOffsetRatio = subject.kind === 'stack-member'
      ? { x: 0.5, y: 0.5 }
      : {
          x: clamp01((start.clientX - originRect.left) / Math.max(1, originRect.width)),
          y: clamp01((start.clientY - originRect.top) / Math.max(1, originRect.height)),
        }
    const initialSurface = dragSurface.getBoundingClientRect()
    let lastPlacement: DragPlacement = {
      kind: 'canvas',
      point: {
        xPct: (originRect.left - initialSurface.left + originRect.width / 2) / Math.max(1, initialSurface.width) * 100,
        yPct: (originRect.top - initialSurface.top + originRect.height / 2) / Math.max(1, initialSurface.height) * 100,
      },
    }
    let moved = false
    let active = true
    let zone: DockEdge | null = null
    let holdTimer: number | null = null
    let candidateKey: string | null = null
    let markedTarget: StackDropTarget | null = null

    const dockable = subject.kind === 'widget'
      ? inputRef.current.canDock?.(subject.id) ?? true
      : false

    function clearStackHold() {
      if (holdTimer !== null) window.clearTimeout(holdTimer)
      holdTimer = null
      candidateKey = null
      markedTarget = null
      setStackTarget(null)
    }

    function setZone(next: DockEdge | null) {
      if (next === zone) return
      zone = next
      inputRef.current.onZoneChange?.(next)
    }

    function stackCandidateAt(clientX: number, clientY: number): StackDropTarget | null {
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

    function armStackHold(target: StackDropTarget | null) {
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

    function removeListeners() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', finish)
      document.removeEventListener('pointercancel', cancelFromPointer)
      dragSurface.removeEventListener('lostpointercapture', cancelFromPointer)
      try {
        dragSurface.releasePointerCapture?.(start.pointerId)
      } catch {
        // Already released or never captured.
      }
    }

    function clearActive(): boolean {
      if (!active) return false
      active = false
      removeListeners()
      clearStackHold()
      setDragging(null)
      setGuideSet(null)
      setZone(null)
      if (activeCancelRef.current === cancelActive) activeCancelRef.current = null
      return true
    }

    function cancelActive() {
      if (!clearActive()) return
      inputRef.current.onCancel?.(subject)
    }

    function cancelFromPointer(event: Event) {
      const pointerId = 'pointerId' in event ? (event as PointerEvent).pointerId : start.pointerId
      if (pointerId !== start.pointerId) return
      cancelActive()
    }

    function onMove(event: PointerEvent) {
      if (!active || event.pointerId !== start.pointerId) return
      event.preventDefault()
      const surfaceRect = dragSurface.getBoundingClientRect()
      const liveRect = inputRef.current.getItemRects().get(sourceKey) ?? originRect
      const member = {
        width: liveRect.width,
        height: liveRect.height,
      }
      const topBand = bandRect('top', surfaceRect)
      const bottomBand = bandRect('bottom', surfaceRect)
      const nextZone = dockable && contains(topBand, event.clientX, event.clientY)
        ? 'top'
        : dockable && contains(bottomBand, event.clientX, event.clientY)
          ? 'bottom'
          : null
      setZone(nextZone)

      if (nextZone !== null) {
        clearStackHold()
        const band = nextZone === 'top' ? topBand : bottomBand
        const neighbors: DockSnapNeighbor[] = []
        for (const [neighborId, rect] of inputRef.current.getItemRects()) {
          if (neighborId === sourceKey) continue
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          if (!contains(band, centerX, centerY)) continue
          neighbors.push({
            id: neighborId,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          })
        }
        const snapped = snapDockPoint({
          pointer: { x: event.clientX, y: event.clientY },
          pointerOffsetRatio,
          member,
          band,
          neighbors,
          bypassMagnetism: Boolean(event.altKey),
        })
        lastPlacement = { kind: 'dock', dock: nextZone, point: snapped.point }
        setGuideSet({ space: nextZone, guides: snapped.guides })
      } else {
        armStackHold(stackCandidateAt(event.clientX, event.clientY))
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
        const pointer = {
          x: event.clientX - surfaceRect.left,
          y: event.clientY - surfaceRect.top,
        }
        const pointerOffset = {
          x: pointerOffsetRatio.x * member.width,
          y: pointerOffsetRatio.y * member.height,
        }
        const bounds = { width: surfaceRect.width, height: surfaceRect.height, inset: 8 }
        const snapped = event.altKey
          ? {
              ...clampCanvasTopLeft({
                left: pointer.x - pointerOffset.x,
                top: pointer.y - pointerOffset.y,
              }, member, bounds),
              guides: [],
            }
          : snapCanvasPosition({ pointer, pointerOffset, box: member, bounds, neighbors })
        lastPlacement = {
          kind: 'canvas',
          point: {
            xPct: (snapped.left + member.width / 2) / Math.max(1, surfaceRect.width) * 100,
            yPct: (snapped.top + member.height / 2) / Math.max(1, surfaceRect.height) * 100,
          },
        }
        setGuideSet({ space: 'canvas', guides: snapped.guides })
      }

      const first = !moved
      moved = true
      inputRef.current.onPreviewMove(subject, lastPlacement, first, {
        clientX: event.clientX,
        clientY: event.clientY,
        altKey: Boolean(event.altKey),
      })
    }

    function finish(event: PointerEvent) {
      if (!active || event.pointerId !== start.pointerId) return
      // The prior preview can change presentation size (free card -> dock
      // line, or the reverse). Re-run geometry at the exact release pointer
      // so containment uses the box that is actually painted at drop time.
      if (moved) onMove(event)
      const droppedTarget = lastPlacement.kind === 'dock' ? null : markedTarget
      const didMove = moved
      if (!clearActive() || !didMove) return
      inputRef.current.onDrop({ placement: lastPlacement, stackTarget: droppedTarget })
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', finish)
    document.addEventListener('pointercancel', cancelFromPointer)
    dragSurface.addEventListener('lostpointercapture', cancelFromPointer)
    activeCancelRef.current = cancelActive
    setDragging(subject)
    setStackTarget(null)
    setGuideSet(null)
    try {
      dragSurface.setPointerCapture?.(start.pointerId)
    } catch {
      // Document listeners are the correctness path when capture is absent.
    }
  }, [])

  const cancelDrag = useCallback(() => {
    activeCancelRef.current?.()
  }, [])

  return { dragging, stackTarget, guideSet, startDrag, cancelDrag }
}
