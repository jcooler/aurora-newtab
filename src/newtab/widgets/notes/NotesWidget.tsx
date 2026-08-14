import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { anchorPanel, hugHorizontal, type PanelPlacement } from '../../../lib/layout/anchor'
import type { NotesPanelHandle } from './NotesPanel'

const NotesPanel = lazy(() => import('./NotesPanel'))

// Matches NotesPanel's fixed w-80 h-64 classes exactly.
export const NOTES_PANEL_SIZE = { w: 320, h: 256 }

// Today's fixed classes inset the pill 4rem (64px) from the left edge while
// the panel hugs the true corner at 1rem (16px) — bottom-4 left-16 (pill)
// vs bottom-16 left-4 (panel), a deliberate 3rem (48px) gap baked into the
// original design. anchorPanel aligns the panel's edge directly to the
// pill's edge, so reproducing that tighter corner-hug means feeding it the
// pill's rect shifted by the same 48px (see Task 35 report for the
// before/after numbers this was verified against). The shift's DIRECTION is
// position-agnostic (hugHorizontal, src/lib/layout/anchor.ts) — it follows
// wherever the pill's rect actually sits, not a hardcoded "always left" sign,
// so a dragged pill still hugs the correct (nearest) corner (Task 36).
export const NOTES_CORNER_HUG_PX = 48

export default function NotesWidget({
  onOpenChange,
}: { onOpenChange?: (open: boolean) => void } = {}) {
  // Keep NotesInner mounted across a settings disable so an open dirty panel
  // can finish (or recover) its authority-backed close before disappearing.
  // Once it is disabled and closed, NotesInner renders nothing.
  const [settings] = useStoredKey('settings')
  if (!settings) return null
  return <NotesInner enabled={settings.widgets.notes} onOpenChange={onOpenChange} />
}

function NotesInner({
  enabled,
  onOpenChange,
}: {
  enabled: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<PanelPlacement | null>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<NotesPanelHandle>(null)

  // Final-review fix wave, Fix 1 — the exact idiom WeatherWidget's own
  // `onExpandedChange` uses (see its comment for the full writeup): a ref
  // keeps this always calling the LATEST callback, never a stale closure,
  // and the cleanup resets the mirrored App state to false on unmount so a
  // disabled/removed widget can never strand the wrapper's elevated z-index
  // open. Same root cause as weather's: this widget's own PositionedBlock
  // wrapper is `fixed` (an unconditional new stacking context), every
  // connector PositionedBlock mounts LATER in App.tsx than this one, and
  // NotesPanel's own internal z-30 is trapped inside that wrapper's local
  // stacking order — so a connector card the open panel geometrically
  // covers paints ON TOP of it at matched (auto) stacking, the DOM-order
  // defect a real-Chromium reviewer probe confirmed (Notes panel under
  // Vercel's card). App.tsx turns this into a conditional `z-30` on the
  // wrapper, only while open.
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  useEffect(() => {
    onOpenChangeRef.current?.(open)
    return () => onOpenChangeRef.current?.(false)
  }, [open])

  // The panel follows the pill: measured on open (not live-tracked — the
  // pill can't move while the panel is open today, since arrange mode closes
  // panels).
  const requestPanelClose = useCallback(() => {
    const panel = panelRef.current
    if (!panel) {
      setOpen(false)
      return Promise.resolve(true)
    }
    return panel.requestClose()
  }, [])

  useEffect(() => {
    if (!enabled && open) void requestPanelClose()
  }, [enabled, open, requestPanelClose])

  const togglePanel = () => {
    if (open) {
      void requestPanelClose()
      return
    }
    if (!enabled) return
    if (pillRef.current) {
      const rect = pillRef.current.getBoundingClientRect()
      const hugged = hugHorizontal(rect, NOTES_CORNER_HUG_PX, window.innerWidth)
      setAnchor(
        anchorPanel(hugged, NOTES_PANEL_SIZE, { w: window.innerWidth, h: window.innerHeight }),
      )
    }
    setOpen(true)
  }

  if (!enabled && !open) return null

  return (
    <>
      {enabled && (
        <button
          ref={pillRef}
          type="button"
          aria-expanded={open}
          onClick={togglePanel}
          className="rounded-panel border border-panel-border bg-panel-solid px-3 py-2 text-sm font-medium text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          Notes
        </button>
      )}
      {open && anchor && (
        <Suspense fallback={null}>
          <NotesPanel ref={panelRef} anchor={anchor} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
