import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BLOCK_IDS, type BlockId, type BlockPos, type Layout } from '../../lib/layout/types'
import { emptyLayoutV2, withLegacyBlockPosition } from '../../lib/layout/v2'
import { clampCenterPct, type Size } from '../../lib/layout/clamp'
import { snapPosition, type Guide, type OtherRect } from '../../lib/layout/snap'
import { choosePillAnchor, pillAnchorRect, type PillAnchor } from '../../lib/layout/pillPlacement'
import { isPremium } from '../../lib/premium'
import { closeAllDialogs, hasOpenDialogs, useDialogEscape } from '../../lib/dialogStack'
import { useStorage } from '../../lib/storage/context'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import ResetLayoutDialog from '../../lib/ResetLayoutDialog'
import { useLongPress } from './useLongPress'
import { WIDGET_REGISTRY_BY_ID } from '../widgetRegistry'

const NUDGE_PX = 8
const NUDGE_PX_FINE = 1
// First-paint guess for the pill's own size, before it's ever been measured
// — corrected synchronously (before the browser paints) by the anchor effect
// below, so the exact numbers here are never actually visible on screen.
const INITIAL_PILL_SIZE: Size = { w: 200, h: 48 }

interface DragState {
  blockId: BlockId
  pos: BlockPos // live percent-center
  guides: Guide[]
  size: Size // px, measured once at drag start
  pointerId: number
}

function viewportSize(): Size {
  return { w: window.innerWidth, h: window.innerHeight }
}

function rectCenterPct(rect: DOMRect, viewport: Size): BlockPos {
  return {
    x: ((rect.left + rect.width / 2) / viewport.w) * 100,
    y: ((rect.top + rect.height / 2) / viewport.h) * 100,
  }
}

/** Inverse of `rectCenterPct` — a percent-center + px size back to a
 *  fixed-position `left/top/width/height` box, against the CURRENT viewport
 *  (not whatever it was when `pos` was computed). Used to render the outline
 *  of whichever block is actively being dragged or keyboard-nudged, so it
 *  tracks the live position instead of a stale entry-measured rect. */
function rectFromPos(
  pos: BlockPos,
  size: Size,
): { left: number; top: number; width: number; height: number } {
  const viewport = viewportSize()
  return {
    left: (pos.x / 100) * viewport.w - size.w / 2,
    top: (pos.y / 100) * viewport.h - size.h / 2,
    width: size.w,
    height: size.h,
  }
}

/** Owns arrange mode end to end: long-press entry, drag (with snap guides),
 *  and the full-viewport overlay — long-press, drag, guides overlay,
 *  persistence, all in one controller (per the brief, rendered last in
 *  `<main>` so its `z-[60]` overlay paints above every widget). Rendered
 *  unconditionally; every actual entry point (`useLongPress`, plus the
 *  defensive re-check in `beginDrag`) gates on `isPremium()`, so this is a
 *  true no-op when that ever returns false.
 *
 *  `onDraftChange` is how the block CURRENTLY being dragged renders live
 *  without touching storage: App wraps its `PositionedBlock`s in
 *  `<DraftLayoutContext.Provider value={draft}>` and passes `setDraft` here
 *  as `onDraftChange` — see `src/newtab/arrange/draftLayout.ts`.
 *
 *  `onModeChange` (review fix) reports every `mode` transition up to App, so
 *  it can apply `inert` to the rest of the page (everything BELOW this
 *  controller in paint order is a sibling, not a descendant, of the overlay
 *  below — the overlay covering it only ever blocked the POINTER, never
 *  keyboard Tab). Entering mode ('off' -> 'on') also closes every open
 *  dialog via `closeAllDialogs` (src/lib/dialogStack.ts), so nothing is left
 *  both open AND about-to-go-inert underneath.
 *
 *  `openSignal` (Task 37) is a bump-to-enter nonce: Settings' "Arrange
 *  layout" button closes the drawer, then increments a counter App owns and
 *  passes through here. Any CHANGE (not the initial value) enters the mode
 *  with no block pre-selected — focus lands on the first Move button in DOM
 *  order instead of a specific engaged block's, see the focus-management
 *  effect below. */
export default function ArrangeController({
  onDraftChange,
  onModeChange,
  openSignal,
}: {
  onDraftChange: (draft: Layout) => void
  onModeChange?: (arranging: boolean) => void
  openSignal?: number
}) {
  const storage = useStorage()
  // Own subscription (mirrors App.tsx's), NOT a prop (review fix C1): the
  // point isn't just reading the current layout, it's REACTING to every
  // change that lands while this component is mounted — including a
  // cross-tab edit arriving mid-arrange, not only this tab's own writes. See
  // the self-healing effect below.
  const [layout] = useStoredKey('layout')
  const [mode, setMode] = useState<'off' | 'on'>('off')
  const modeRef = useRef<'off' | 'on'>('off')
  const mountedRef = useRef(true)
  const entryPromiseRef = useRef<Promise<void> | null>(null)
  const [rects, setRects] = useState<Partial<Record<BlockId, DOMRect>>>({})
  const [drag, setDrag] = useState<DragState | null>(null)
  // Committed keyboard-nudge positions this session, keyed by block —
  // mirrors `drag.pos` for the pointer path: without it, (a) a nudged
  // block's OWN outline would lag a full render behind (outlines are only
  // re-measured "on entry + on resize", same reasoning as the dragged
  // outline's own live-tracking fix), and (b) each new nudge would have
  // nothing to compound onto except the stale original rect, so repeated
  // presses would keep landing on the SAME position instead of moving
  // further each time. Cleared on `exit` so the next session's first nudge
  // always re-derives its base from a fresh measurement.
  const [nudged, setNudged] = useState<Partial<Record<BlockId, BlockPos>>>({})
  const overlayRef = useRef<HTMLDivElement>(null)
  // What to focus once the overlay's outlines exist for the entry currently
  // in flight — a specific block (long-press engaged it) or 'first' (the
  // Settings entry point, which doesn't pre-select any block). Consumed
  // (nulled) by the focus-management effect below the moment it succeeds.
  const pendingFocusRef = useRef<BlockId | 'first' | null>(null)
  // Whether the "Reset layout?" confirm dialog (src/lib/ResetLayoutDialog.tsx
  // — shared with Settings' Layout section, see its own doc comment) is up.
  // Declared here (not down by the JSX that uses it) so `exit`, below, and
  // `handleOutlineKeyDown` further down can both read it.
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  modeRef.current = mode
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Pill placement (Jon: "reset layout and done buttons are right on top of
  // a widget") — `pillRef` measures the pill's own rendered size (content-
  // driven, effectively anchor-independent: same buttons/text regardless of
  // where it's placed), `pillAnchor` is which of `choosePillAnchor`'s
  // candidates is currently clear of every block. Both start at a guess
  // (see INITIAL_PILL_SIZE / 'bottom-center', the pre-dodge default) that the
  // layout effect below corrects before the very first paint.
  const pillRef = useRef<HTMLDivElement>(null)
  const [pillSize, setPillSize] = useState<Size>(INITIAL_PILL_SIZE)
  const [pillAnchor, setPillAnchor] = useState<PillAnchor>('bottom-center')

  const measureAll = useCallback((): Partial<Record<BlockId, DOMRect>> => {
    const next: Partial<Record<BlockId, DOMRect>> = {}
    for (const id of BLOCK_IDS) {
      const el = document.querySelector(`[data-block-id="${id}"]`)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      // A disabled/empty widget still renders its PositionedBlock wrapper
      // (the widget itself returns null INSIDE it) — a 0x0 rect has nothing
      // to outline or drag, same "skip" convention PositionedBlock's own
      // clamp measurement uses.
      if (rect.width === 0 && rect.height === 0) continue
      next[id] = rect
    }
    setRects(next)
    return next
  }, [])

  const exit = useCallback(() => {
    modeRef.current = 'off'
    setMode('off')
    setDrag(null)
    setNudged({})
    // Don't leave the confirm dialog stranded open across a re-entry — this
    // component stays mounted the whole page session, so without this a
    // dialog left open (e.g. Escape closing arrange mode out from under it —
    // can't normally happen since it's the newer stack entry and closes
    // first, but this is the same defense-in-depth the old armed-Reset
    // disarm-on-exit had) would ambush the next session already open.
    setResetDialogOpen(false)
    onDraftChange({})
  }, [onDraftChange])

  // Newest-first shared Escape stack (src/lib/dialogStack.ts) — only active
  // while arrange mode is on.
  useDialogEscape(exit, mode === 'on')

  // Reports every `mode` transition up to App (review fix), which flips its
  // own `arranging` state and applies `inert` to everything below this
  // controller in the tree — see the prop doc above.
  useEffect(() => {
    onModeChange?.(mode === 'on')
  }, [mode, onModeChange])

  // Re-measure outlines on resize while the mode is up (per the brief:
  // "measured on entry + on resize"). Entry itself is measured synchronously
  // by beginDrag below, so this effect's own immediate call is a harmless,
  // idempotent extra pass.
  useEffect(() => {
    if (mode !== 'on') return
    measureAll()
    window.addEventListener('resize', measureAll)
    return () => window.removeEventListener('resize', measureAll)
  }, [mode, measureAll])

  // Self-healing rects (CRITICAL review fix C1): `rects` is otherwise only
  // ever re-measured on mode entry + window resize (the effect just above)
  // — a confirmed in-pill Reset (`resetConfirm`, below) or a cross-tab edit
  // landing mid-session both change `layout` without going through either of
  // those paths, leaving `rects` (and therefore every outline's rendered
  // position, AND the base a keyboard nudge computes its NEXT position from)
  // silently pointing at wherever blocks were BEFORE the change. Left alone,
  // the very next arrow-nudge on a just-reset block reads its stale
  // pre-reset `rects` entry and writes the block right back to
  // (approximately) where it was — silently undoing the reset the user just
  // confirmed.
  //
  // Scheduled via requestAnimationFrame rather than measuring synchronously
  // in this effect: every PositionedBlock sibling (App.tsx) reacts to the
  // SAME `layout` change via its own independent subscription, and needs to
  // have actually re-rendered and committed the new position to the DOM
  // first — otherwise this would just re-measure the STILL-stale rects.
  // rAF's "runs right before the next paint, after all pending script has
  // run" guarantee holds regardless of whether that sibling re-render lands
  // in the same React commit as this one or a separate one shortly after.
  //
  // Feature-detected (some environments have no requestAnimationFrame at
  // all — same defensive shape as ResizeObserver in PositionedBlock.tsx and
  // pointer capture above) with a synchronous fallback; tests exercise the
  // real rAF branch under fake timers (`vi.advanceTimersToNextFrame()`),
  // since jsdom-via-vitest does provide one.
  useEffect(() => {
    if (mode !== 'on') return
    if (typeof requestAnimationFrame === 'function') {
      const raf = requestAnimationFrame(() => measureAll())
      return () => cancelAnimationFrame(raf)
    }
    measureAll()
    return undefined
  }, [mode, layout, measureAll])

  // Pill dodge (Jon: never sit on top of a widget) — re-picks the pill's
  // anchor every time `rects` changes (mode entry, window resize, and the
  // self-healing re-measure above all funnel through it already), using the
  // pill's OWN just-measured size against every block's current rect. A
  // `useLayoutEffect`, not `useEffect`: it must resolve (and, via
  // `setPillAnchor`/`setPillSize`, potentially re-render) before the browser
  // paints, so a stale first-guess position is never actually visible — see
  // INITIAL_PILL_SIZE's own comment.
  useLayoutEffect(() => {
    if (mode !== 'on') return
    const pillEl = pillRef.current
    if (!pillEl) return
    const pillRect = pillEl.getBoundingClientRect()
    const nextSize: Size = { w: pillRect.width, h: pillRect.height }
    const viewport = viewportSize()
    const blockRects = Object.values(rects).filter((r): r is DOMRect => r !== undefined)
    setPillSize((prev) => (prev.w === nextSize.w && prev.h === nextSize.h ? prev : nextSize))
    setPillAnchor(choosePillAnchor(nextSize, blockRects, viewport))
  }, [mode, rects])

  // Claim real pointer capture on the overlay once a drag starts, so the
  // eventual release is delivered even if the pointer strays outside the
  // window (jsdom has no Pointer Capture — feature-detected and wrapped in
  // try/catch, so this is a silent no-op there; tests instead dispatch
  // move/up directly on an overlay descendant, which is what capture would
  // have routed them to anyway).
  useLayoutEffect(() => {
    if (!drag) return
    const overlay = overlayRef.current
    if (overlay && typeof overlay.setPointerCapture === 'function') {
      try {
        overlay.setPointerCapture(drag.pointerId)
      } catch {
        /* invalid/stale pointerId — nothing to capture */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-capture when a NEW drag starts, not on every live-position update
  }, [drag?.blockId, drag?.pointerId])

  const releaseCapture = (pointerId: number) => {
    const overlay = overlayRef.current
    if (overlay && typeof overlay.releasePointerCapture === 'function') {
      try {
        overlay.releasePointerCapture(pointerId)
      } catch {
        /* already released */
      }
    }
  }

  const enterAfterClosing = useCallback((enter: () => void) => {
    if (modeRef.current === 'on') {
      enter()
      return
    }
    if (!hasOpenDialogs()) {
      modeRef.current = 'on'
      enter()
      return
    }
    if (entryPromiseRef.current) return

    const operation = (async () => {
      const closed = await closeAllDialogs()
      if (!closed || !mountedRef.current || !isPremium() || modeRef.current !== 'off') return
      modeRef.current = 'on'
      enter()
    })().finally(() => {
      entryPromiseRef.current = null
    })
    entryPromiseRef.current = operation
  }, [])

  const beginDrag = useCallback(
    (blockId: BlockId, pointerId: number) => {
      if (!isPremium()) return // defense in depth — useLongPress's own gate is the primary one
      const fresh = measureAll()
      const rect = fresh[blockId]
      if (!rect) return // nothing rendered/visible to drag
      const viewport = viewportSize()
      // CRITICAL review fix: prefer `nudged[blockId]` (this block's own
      // last-known-good effective position, reconciled on every drag commit
      // AND every keyboard nudge — see handlePointerUp/handleOutlineKeyDown)
      // over a fresh `getBoundingClientRect()` measurement. The measurement
      // is the block's ACTUAL rendered rect, which is fine the FIRST time a
      // block is ever touched — but once a block has been nudged or dragged
      // before, `rects`/a fresh measurement can still reflect a position
      // that's about to be superseded (e.g. this exact press IS the "grab a
      // different outline" path, or the previous nudge's draft/storage
      // write hasn't visibly landed yet) — `nudged` is the one value both
      // drag and keyboard nudging keep in sync with each other, so it's the
      // authoritative source whenever it exists.
      const pos = nudged[blockId] ?? rectCenterPct(rect, viewport)
      const size: Size = { w: rect.width, h: rect.height }
      // Entering arrange mode must leave zero panels open underneath the
      // (about to become inert) page — see dialogStack.closeAllDialogs. Only
      // gated to the actual off->on transition: once already arranging, the
      // rest of the page is inert, so nothing could have reopened a panel in
      // the meantime and the stack is already empty.
      enterAfterClosing(() => {
        pendingFocusRef.current = blockId // focus THIS block's own Move button once it renders
        setMode('on')
        setDrag({ blockId, pos, guides: [], size, pointerId })
        onDraftChange({ [blockId]: pos })
      })
    },
    [enterAfterClosing, measureAll, onDraftChange, nudged],
  )

  // The long-press entry point: engaging on ANY block immediately begins
  // dragging it (per the brief).
  useLongPress(
    useCallback((blockId: BlockId, e: PointerEvent) => beginDrag(blockId, e.pointerId), [beginDrag]),
  )

  // The Settings entry point (Task 37): no block is pre-selected, so this
  // measures fresh (same as beginDrag) and just turns the mode on, leaving
  // `drag` untouched (null — App only calls this from mode 'off', where it
  // already is).
  const enterViaSettings = useCallback(() => {
    if (!isPremium()) return // defense in depth — the real gate is the Settings button being hidden entirely when false
    measureAll()
    enterAfterClosing(() => {
      pendingFocusRef.current = 'first'
      setMode('on')
    })
  }, [enterAfterClosing, measureAll])

  // `openSignal` is a nonce: any CHANGE from its previous value (not merely
  // being defined) enters the mode. Comparing against a ref (rather than,
  // say, always entering when `openSignal` is truthy) means App can freely
  // start the counter at 0 and this effect still won't fire on mount.
  const prevOpenSignalRef = useRef(openSignal)
  useEffect(() => {
    if (openSignal === undefined) return
    if (prevOpenSignalRef.current === openSignal) return
    prevOpenSignalRef.current = openSignal
    enterViaSettings()
  }, [openSignal, enterViaSettings])

  // Focus management on ENTRY: consumes `pendingFocusRef` (set by beginDrag
  // or enterViaSettings, just above) the moment the outline it names actually
  // exists in the DOM. Depends on `rects` too, not just `mode`, because
  // `enterViaSettings`'s own `measureAll()` call and `setMode('on')` are two
  // separate state updates — this effect re-fires once `rects` itself
  // updates, which is exactly when the outlines for a fresh (non-drag) entry
  // first render.
  useEffect(() => {
    if (mode !== 'on') return
    const pending = pendingFocusRef.current
    if (!pending) return
    const overlay = overlayRef.current
    if (!overlay) return
    const selector =
      pending === 'first'
        ? 'button[aria-label^="Move "]'
        : `button[aria-label="Move ${WIDGET_REGISTRY_BY_ID[pending].label}"]`
    const target = overlay.querySelector<HTMLButtonElement>(selector)
    if (!target) return // outlines for this entry haven't rendered yet — try again once rects/drag update
    target.focus()
    pendingFocusRef.current = null
  }, [mode, rects, drag])

  const handleOutlinePointerDown = (blockId: BlockId, e: React.PointerEvent) => {
    if (drag) return // one drag at a time; ignore a second concurrent pointer
    e.preventDefault()
    beginDrag(blockId, e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const viewport = viewportSize()
    const rawPct: BlockPos = {
      x: (e.clientX / viewport.w) * 100,
      y: (e.clientY / viewport.h) * 100,
    }
    const others: OtherRect[] = BLOCK_IDS.filter((id) => id !== drag.blockId)
      .map((id) => rects[id])
      .filter((r): r is DOMRect => r !== undefined)
      .map((r) => ({ cxPx: r.left + r.width / 2, cyPx: r.top + r.height / 2, w: r.width, h: r.height }))

    const snapped = snapPosition(rawPct, drag.size, others, viewport)
    const clamped = clampCenterPct(snapped.pos, drag.size, viewport)

    setDrag({ ...drag, pos: clamped, guides: snapped.guides })
    onDraftChange({ [drag.blockId]: clamped })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const { blockId, pos, pointerId } = drag
    void storage.update('layout', (current) => withLegacyBlockPosition(current, blockId, pos))
    // CRITICAL review fix: reconcile `nudged` with the position this drag
    // just committed. `rects`/a fresh DOM measurement won't reflect this
    // until the next resize or mode re-entry, so without this, a keyboard
    // nudge on this SAME block right after dropping it would base off the
    // STALE pre-drag rect and visibly jump the block back toward its old
    // spot — see handleOutlineKeyDown's `nudged[blockId] ?? …` base and
    // beginDrag's mirrored read of `nudged` above.
    const nextNudged = { ...nudged, [blockId]: pos }
    setNudged(nextNudged)
    releaseCapture(pointerId)
    setDrag(null)
    // Important review fix I2: keep the dropped block's entry in the draft
    // (same shape handleOutlineKeyDown already sends) instead of clearing it
    // to `{}`. `storage.update` above is fire-and-forget — its real commit
    // (and the subscribed echo back through `layout`/PositionedBlock's `pos`
    // prop) lands some ticks later. Clearing the draft synchronously here,
    // BEFORE that echo arrives, left PositionedBlock with no draft override
    // AND a still-stale `pos` prop for one real render — the dropped block
    // visibly flickered back to its pre-drag spot for a frame before
    // snapping to where it was just dropped. Keeping `pos` in the draft
    // means the rendered position is identical right up until `exit()`
    // clears everything, by which point the real write has long since
    // landed and prop-driven rendering shows the same value anyway.
    onDraftChange(nextNudged)
  }

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    // A cancelled gesture never commits — no storage write.
    releaseCapture(drag.pointerId)
    setDrag(null)
    onDraftChange({})
  }

  // Arrow-key nudging: operates on the focused block's CURRENT effective
  // position — `nudged[blockId]` if it's already been nudged this session,
  // else derived from its live measured rect (never a hardcoded/zero
  // default), so the FIRST press never jumps the block somewhere else. Each
  // press commits immediately via storage.update (unlike a pointer drag,
  // there's no separate "release" event to defer to) and runs through the
  // same `clampCenterPct` the drag path uses, so a block can never be nudged
  // past the viewport edge.
  const handleOutlineKeyDown = (blockId: BlockId, e: React.KeyboardEvent<HTMLButtonElement>) => {
    // While the confirm dialog is up, the outline's own arrows/Enter must not
    // fire — the dialog's focus trap already keeps focus (and therefore real
    // keydown targets) inside itself, so this is belt-and-suspenders, not
    // load-bearing; Escape is unaffected (it bubbles to the document-level
    // dialog-stack listener regardless, and the dialog's own newer stack
    // entry closes it first either way — see ResetLayoutDialog's doc comment).
    if (resetDialogOpen) return
    if (e.key === 'Enter') {
      e.preventDefault()
      exit()
      return
    }
    let dx = 0
    let dy = 0
    switch (e.key) {
      case 'ArrowUp':
        dy = -1
        break
      case 'ArrowDown':
        dy = 1
        break
      case 'ArrowLeft':
        dx = -1
        break
      case 'ArrowRight':
        dx = 1
        break
      default:
        return // Tab/Shift-Tab (native cycling) and everything else pass through untouched; Escape bubbles to the document-level dialog-stack listener
    }
    e.preventDefault()
    const rect = rects[blockId]
    if (!rect) return
    const viewport = viewportSize()
    const size: Size = { w: rect.width, h: rect.height }
    const stepPx = e.shiftKey ? NUDGE_PX_FINE : NUDGE_PX
    const base = nudged[blockId] ?? rectCenterPct(rect, viewport)
    const raw: BlockPos = {
      x: base.x + ((dx * stepPx) / viewport.w) * 100,
      y: base.y + ((dy * stepPx) / viewport.h) * 100,
    }
    const next = clampCenterPct(raw, size, viewport)
    const nextNudged = { ...nudged, [blockId]: next }
    setNudged(nextNudged)
    onDraftChange(nextNudged)
    void storage.update('layout', (current) => withLegacyBlockPosition(current, blockId, next))
  }

  if (mode !== 'on') return null

  const pillRect = pillAnchorRect(pillAnchor, pillSize, viewportSize())

  return (
    <div
      ref={overlayRef}
      // Identifies this element as the arrange-mode overlay for the
      // real-browser Tab-inertness preview probe (scripts/preview.mjs):
      // jsdom only ever asserts the sibling wrapper's `inert` ATTRIBUTE, not
      // its actual focus-blocking behavior, so that probe walks
      // `document.activeElement` after repeated Tabs and confirms it never
      // leaves `[data-arrange-overlay]` — i.e. `inert` really is keeping Tab
      // off the rest of the page in a real browser. No runtime behavior
      // depends on this attribute; it exists purely as a stable selector.
      data-arrange-overlay=""
      className="fixed inset-0 z-[60]"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {BLOCK_IDS.map((id) => {
        const isDragging = drag?.blockId === id
        const measured = rects[id]
        const size: Size | null =
          isDragging && drag ? drag.size : measured ? { w: measured.width, h: measured.height } : null
        if (!size) return null
        // The block actively being dragged OR keyboard-nudged tracks its
        // LIVE position (converted back to px), not its stale
        // entry-measured rect — rects are only re-measured "on entry + on
        // resize" (per the brief), so without this the outline would
        // visibly lag behind the pointer/keypress while only the real
        // widget content (via the draft override) moved. Every OTHER
        // block's outline correctly stays at its static measured rect
        // (they haven't moved).
        const rect =
          isDragging && drag
            ? rectFromPos(drag.pos, drag.size)
            : nudged[id]
              ? rectFromPos(nudged[id]!, size)
              : measured!
        return (
          <button
            key={id}
            type="button"
            aria-label={`Move ${WIDGET_REGISTRY_BY_ID[id].label}`}
            onPointerDown={(e) => handleOutlinePointerDown(id, e)}
            onKeyDown={(e) => handleOutlineKeyDown(id, e)}
            style={{
              position: 'fixed',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }}
            className={`rounded-md border-2 border-accent/60 bg-accent/10 transition-transform duration-150 motion-reduce:transition-none motion-reduce:duration-0 focus-visible:outline-2 focus-visible:outline-accent ${
              isDragging ? 'scale-[1.03] border-accent shadow-lg' : ''
            }`}
          />
        )
      })}

      {drag?.guides.map((g, i) =>
        g.axis === 'v' ? (
          <div
            key={`v-${i}`}
            aria-hidden
            className="fixed inset-y-0 w-px bg-accent"
            style={{ left: `${g.pct}%` }}
          />
        ) : (
          <div
            key={`h-${i}`}
            aria-hidden
            className="fixed inset-x-0 h-px bg-accent"
            style={{ top: `${g.pct}%` }}
          />
        ),
      )}

      {/* Positioned via inline left/top (not Tailwind bottom-4/left-1/2)
          computed from `pillAnchor` — the dodge decision (Jon: "reset layout
          and done buttons are right on top of a widget") needs the EXACT
          same geometry for both "does this collide" and "where does it
          render", which inline styles from the same `pillAnchorRect` call
          guarantee; Tailwind's translate-based centering can't express the
          non-default anchors (above-bottom-center/top-center/bottom-left)
          without duplicating that math a second way. */}
      <div
        ref={pillRef}
        style={{ left: pillRect.left, top: pillRect.top }}
        className="fixed flex items-center gap-2 rounded-panel border border-panel-border bg-panel-solid px-3 py-2 text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]"
      >
        {/* Danger-styled per Jon's explicit feedback: a restrained red TEXT
            treatment (no filled/solid background) — the codebase has no
            other danger-action convention to match, so this establishes one,
            reused verbatim by ResetLayoutDialog's own "Reset layout" button
            and Settings' Layout section. Opens the shared confirm dialog
            below instead of the old two-click arm/auto-expire idiom
            (Jon: the auto-expiring armed button was itself the complaint). */}
        <button
          type="button"
          onClick={() => setResetDialogOpen(true)}
          className="rounded-full border border-panel-border px-3 py-1 text-sm text-red-400 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-accent"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={exit}
          className="rounded-full border border-accent px-3 py-1 text-sm text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
        >
          Done
        </button>
      </div>

      <ResetLayoutDialog
        open={resetDialogOpen}
        onCancel={() => setResetDialogOpen(false)}
        onConfirm={() => {
          setResetDialogOpen(false)
          void storage.set('layout', emptyLayoutV2())
          setNudged({})
          onDraftChange({})
        }}
      />
    </div>
  )
}
