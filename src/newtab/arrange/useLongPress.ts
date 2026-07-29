import { useEffect, useRef } from 'react'
import type { BlockId } from '../../lib/layout/types'
import { isPremium } from '../../lib/premium'

const DEFAULT_HOLD_MS = 500
const DEFAULT_TOLERANCE_PX = 8

/** Document-level capture-phase long-press detector — no per-widget wiring.
 *  A press on (a descendant of) any `[data-block-id]` element starts a
 *  `holdMs` timer; moving past `tolerancePx` or releasing/cancelling before
 *  it fires aborts silently. On fire, `onEngage` runs and a one-shot
 *  capture-phase `click` suppressor is installed so the eventual release
 *  never activates whatever's under the pointer (a button, a link, …).
 *
 *  No-ops entirely when `isPremium()` is false — checked once, when this
 *  effect (re-)runs, not per event; arrange mode has exactly one entry
 *  point today, and this is it. */
export function useLongPress(
  onEngage: (blockId: BlockId, e: PointerEvent) => void,
  opts?: { holdMs?: number; tolerancePx?: number },
): void {
  const onEngageRef = useRef(onEngage)
  onEngageRef.current = onEngage

  const holdMs = opts?.holdMs ?? DEFAULT_HOLD_MS
  const tolerancePx = opts?.tolerancePx ?? DEFAULT_TOLERANCE_PX

  useEffect(() => {
    if (!isPremium()) return

    let timer: ReturnType<typeof setTimeout> | null = null
    let trackedPointerId: number | null = null
    let blockId: BlockId | null = null
    let startX = 0
    let startY = 0
    // The one-shot click suppressor currently installed (if any) — tracked so
    // a NEW press can clear a stale one before it ever attaches a second
    // listener, bounding how long a suppressor can possibly linger (normally
    // it consumes itself on the very next click; this is just a safety net
    // for the rare case a click never follows, e.g. the drag that took over
    // after engage ends via some path other than a plain release).
    let pendingSuppressor: ((e: MouseEvent) => void) | null = null

    function clearSuppressor() {
      if (!pendingSuppressor) return
      document.removeEventListener('click', pendingSuppressor, true)
      pendingSuppressor = null
    }

    function stopTracking() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('pointercancel', onPointerUp, true)
      trackedPointerId = null
      blockId = null
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerId !== trackedPointerId) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (Math.hypot(dx, dy) > tolerancePx) stopTracking()
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerId !== trackedPointerId) return
      stopTracking()
    }

    function onFire() {
      const id = blockId
      const e = firingEvent
      timer = null
      // Stop tracking move/up for the hold itself — a separate concern
      // (drag) takes over the pointer from here.
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('pointercancel', onPointerUp, true)
      trackedPointerId = null
      blockId = null
      if (!id || !e) return

      clearSuppressor()
      function suppressClick(ev: MouseEvent) {
        ev.stopPropagation()
        ev.preventDefault()
        pendingSuppressor = null
      }
      pendingSuppressor = suppressClick
      document.addEventListener('click', suppressClick, { capture: true, once: true })

      onEngageRef.current(id, e)
    }

    // Stashed for onFire (setTimeout callbacks don't receive the original
    // event) — set immediately before scheduling the timer below.
    let firingEvent: PointerEvent | null = null

    function onPointerDown(e: PointerEvent) {
      if (trackedPointerId !== null) return // a press is already being tracked; ignore a second (multi-touch) pointer
      clearSuppressor() // a fresh press means any prior engage's click has definitely already resolved
      const target = e.target
      const blockEl = target instanceof Element ? target.closest('[data-block-id]') : null
      if (!blockEl) return
      const id = blockEl.getAttribute('data-block-id') as BlockId | null
      if (!id) return

      blockId = id
      trackedPointerId = e.pointerId
      startX = e.clientX
      startY = e.clientY
      firingEvent = e

      document.addEventListener('pointermove', onPointerMove, true)
      document.addEventListener('pointerup', onPointerUp, true)
      document.addEventListener('pointercancel', onPointerUp, true)

      timer = setTimeout(onFire, holdMs)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      stopTracking()
      clearSuppressor()
    }
  }, [holdMs, tolerancePx])
}
