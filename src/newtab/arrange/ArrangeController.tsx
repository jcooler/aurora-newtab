import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BLOCK_IDS, type BlockId, type BlockPos, type Layout } from '../../lib/layout/types'
import { clampCenterPct, type Size } from '../../lib/layout/clamp'
import { snapPosition, type Guide, type OtherRect } from '../../lib/layout/snap'
import { isPremium } from '../../lib/premium'
import { useDialogEscape } from '../../lib/dialogStack'
import { useStorage } from '../../lib/storage/context'
import { useLongPress } from './useLongPress'

const BLOCK_LABELS: Record<BlockId, string> = {
  clock: 'Clock',
  greeting: 'Greeting',
  worldClocks: 'World clocks',
  countdown: 'Countdown',
  search: 'Search',
  focus: 'Focus',
  links: 'Links',
  quote: 'Quote',
  weather: 'Weather',
  timer: 'Timer',
  tasks: 'Tasks',
  notes: 'Notes',
  bookmarks: 'Bookmarks',
}

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
 *  as `onDraftChange` — see `src/newtab/arrange/draftLayout.ts`. */
export default function ArrangeController({
  onDraftChange,
}: {
  onDraftChange: (draft: Layout) => void
}) {
  const storage = useStorage()
  const [mode, setMode] = useState<'off' | 'on'>('off')
  const [rects, setRects] = useState<Partial<Record<BlockId, DOMRect>>>({})
  const [drag, setDrag] = useState<DragState | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

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
    setMode('off')
    setDrag(null)
    onDraftChange({})
  }, [onDraftChange])

  // Newest-first shared Escape stack (src/lib/dialogStack.ts) — only active
  // while arrange mode is on.
  useDialogEscape(exit, mode === 'on')

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

  const beginDrag = useCallback(
    (blockId: BlockId, pointerId: number) => {
      if (!isPremium()) return // defense in depth — useLongPress's own gate is the primary one
      const fresh = measureAll()
      const rect = fresh[blockId]
      if (!rect) return // nothing rendered/visible to drag
      const viewport = viewportSize()
      const pos = rectCenterPct(rect, viewport)
      const size: Size = { w: rect.width, h: rect.height }
      setMode('on')
      setDrag({ blockId, pos, guides: [], size, pointerId })
      onDraftChange({ [blockId]: pos })
    },
    [measureAll, onDraftChange],
  )

  // The long-press entry point: engaging on ANY block immediately begins
  // dragging it (per the brief).
  useLongPress(
    useCallback((blockId: BlockId, e: PointerEvent) => beginDrag(blockId, e.pointerId), [beginDrag]),
  )

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
    void storage.update('layout', (current) => ({ ...current, [blockId]: pos }))
    releaseCapture(pointerId)
    setDrag(null)
    onDraftChange({})
  }

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    // A cancelled gesture never commits — no storage write.
    releaseCapture(drag.pointerId)
    setDrag(null)
    onDraftChange({})
  }

  const handleReset = () => {
    void storage.update('layout', () => ({}))
    onDraftChange({})
  }

  if (mode !== 'on') return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60]"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {BLOCK_IDS.map((id) => {
        const isDragging = drag?.blockId === id
        // The block actively being dragged tracks the LIVE drag position
        // (converted back to px), not its stale entry-measured rect — rects
        // are only re-measured "on entry + on resize" (per the brief), so
        // without this the dragged block's own outline would visibly lag
        // behind the pointer while only its real content (via the draft
        // override) moved, even though every OTHER block's outline
        // correctly stays put (they haven't moved).
        const rect =
          isDragging && drag
            ? {
                left: (drag.pos.x / 100) * window.innerWidth - drag.size.w / 2,
                top: (drag.pos.y / 100) * window.innerHeight - drag.size.h / 2,
                width: drag.size.w,
                height: drag.size.h,
              }
            : rects[id]
        if (!rect) return null
        return (
          <button
            key={id}
            type="button"
            aria-label={`Move ${BLOCK_LABELS[id]}`}
            onPointerDown={(e) => handleOutlinePointerDown(id, e)}
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

      <div className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-panel border border-panel-border bg-[#17171c]/95 px-3 py-2 text-fg backdrop-blur-[var(--panel-blur)]">
        <button
          type="button"
          onClick={handleReset}
          className="rounded-full border border-panel-border px-3 py-1 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          Reset layout
        </button>
        <button
          type="button"
          onClick={exit}
          className="rounded-full border border-accent px-3 py-1 text-sm text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
        >
          Done
        </button>
      </div>
    </div>
  )
}
