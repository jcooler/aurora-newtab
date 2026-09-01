import { useEffect, useRef } from 'react'
import type { BlockId } from '../../lib/layout/types'

const DEFAULT_HOLD_MS = 500
const DEFAULT_TOLERANCE_PX = 8
const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [role="button"], [contenteditable="true"]'

/** Document-level capture-phase long-press detector — no per-widget wiring.
 *  A press on (a descendant of) any `[data-block-id]` element starts a
 *  `holdMs` timer; moving past `tolerancePx` or releasing/cancelling before
 *  it fires aborts silently. On fire, `onEngage` runs and a one-shot
 *  capture-phase `click` suppressor is installed so the eventual release
 *  never activates whatever's under the pointer (a button, a link, …).
 *
 *  Interactive elements — anything matching `INTERACTIVE_SELECTOR` below —
 *  do not arm the timer unless they are the marked block's direct launcher
 *  button. That narrow exception lets button-only launchers enter Arrange
 *  without exposing nested controls. Jon's bug report: holding a focus-timer minute
 *  `<input type="number">`'s native spin buttons to run the value up/down
 *  fast was ALSO arming this timer — 500ms into the hold it fired, entered
 *  arrange mode, and the one-shot click suppressor ate the click that would
 *  have committed the input's value. More generally, press-and-HOLD is the
 *  wrong gesture to share with a nested control that already has its own
 *  hold-to-repeat or click semantics (links, native number-input spinners,
 *  and panel buttons). Direct launchers deliberately suppress their eventual
 *  click after the hold engages, while a short press behaves normally.
 */
export function useLongPress(
  onEngage: (blockId: BlockId, e: PointerEvent) => void,
  opts?: { holdMs?: number; tolerancePx?: number },
): void {
  const onEngageRef = useRef(onEngage)
  onEngageRef.current = onEngage

  const holdMs = opts?.holdMs ?? DEFAULT_HOLD_MS
  const tolerancePx = opts?.tolerancePx ?? DEFAULT_TOLERANCE_PX

  useEffect(() => {
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
      // Nested controls never arm the timer. A marked direct launcher button
      // is the only interactive exception, so button-only blocks can still
      // enter Arrange without reviving the timer-input hold regression.
      const interactive = target instanceof Element ? target.closest(INTERACTIVE_SELECTOR) : null
      if (interactive) {
        const directLauncher = blockEl.getAttribute('data-arrange-long-press-controls') === 'true'
          && interactive.matches('button, [role="button"]')
          && interactive.parentElement === blockEl
        if (!directLauncher) return
      }
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
