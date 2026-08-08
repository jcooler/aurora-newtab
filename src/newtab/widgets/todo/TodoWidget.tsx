import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { anchorPanel, hugHorizontal, type PanelPlacement } from '../../../lib/layout/anchor'

const TodoPanel = lazy(() => import('./TodoPanel'))

// TodoPanel has no fixed-height class (w-80, max-h-[70vh], auto height up to
// that cap) — this is its measured height in the deterministic default-open
// state (a freshly auto-seeded empty "Today" list, before any task is
// added). Width matches the panel's w-80 class exactly.
export const TODO_PANEL_SIZE = { w: 320, h: 217 }

// Today's fixed classes inset the pill 4rem (64px) from the right edge while
// the panel hugs the true corner at 1rem (16px) — bottom-4 right-16 (pill)
// vs bottom-16 right-4 (panel), a deliberate 3rem (48px) gap baked into the
// original design. anchorPanel aligns the panel's edge directly to the
// pill's edge, so reproducing that tighter corner-hug means feeding it the
// pill's rect shifted by the same 48px (see Task 35 report for the
// before/after numbers this was verified against). The shift's DIRECTION is
// position-agnostic (hugHorizontal, src/lib/layout/anchor.ts) — it follows
// wherever the pill's rect actually sits, not a hardcoded "always right"
// sign, so a dragged pill still hugs the correct (nearest) corner (Task 36).
export const TODO_CORNER_HUG_PX = 48

export default function TodoWidget({
  onOpenChange,
}: { onOpenChange?: (open: boolean) => void } = {}) {
  // Gate BEFORE the panel's open/close state exists, same shape as
  // NotesWidget/TimerWidget: a disabled widget (settings.widgets.todo can be
  // switched off mid-session) mounts nothing past the settings read, which
  // is what makes the onOpenChange cleanup below fire reliably on a
  // mid-session disable — a single component that gated AFTER its own hooks
  // would keep the SAME instance alive (React never remounts on a value
  // change, only an identity change), so its effect's cleanup would never
  // run and a stuck-open mirrored state could strand the wrapper's z-30
  // forever. See WeatherWidget's own onExpandedChange comment for the full
  // writeup of why that guarantee matters.
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.todo) return null
  return <TodoInner onOpenChange={onOpenChange} />
}

function TodoInner({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<PanelPlacement | null>(null)
  const pillRef = useRef<HTMLButtonElement>(null)

  // Final-review fix wave, Fix 1 — the exact idiom WeatherWidget's own
  // `onExpandedChange` uses (see its comment for the full writeup): a ref
  // keeps this always calling the LATEST callback, never a stale closure,
  // and the cleanup resets the mirrored App state to false on unmount so a
  // disabled/removed widget can never strand the wrapper's elevated z-index
  // open. Same root cause as weather's: this widget's own PositionedBlock
  // wrapper is `fixed` (an unconditional new stacking context), every
  // connector PositionedBlock mounts LATER in App.tsx than this one, and
  // TodoPanel's own internal z-30 is trapped inside that wrapper's local
  // stacking order — so a connector card the open panel geometrically
  // covers paints ON TOP of it at matched (auto) stacking, the DOM-order
  // defect a real-Chromium reviewer probe confirmed (Tasks panel under
  // Jira's card). App.tsx turns this into a conditional `z-30` on the
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
  const togglePanel = () => {
    if (open) {
      setOpen(false)
      return
    }
    if (pillRef.current) {
      const rect = pillRef.current.getBoundingClientRect()
      const hugged = hugHorizontal(rect, TODO_CORNER_HUG_PX, window.innerWidth)
      setAnchor(
        anchorPanel(hugged, TODO_PANEL_SIZE, { w: window.innerWidth, h: window.innerHeight }),
      )
    }
    setOpen(true)
  }

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        aria-expanded={open}
        onClick={togglePanel}
        className="rounded-panel border border-panel-border bg-panel px-3 py-2 text-sm font-medium text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        Tasks
      </button>
      {open && anchor && (
        <Suspense fallback={null}>
          <TodoPanel anchor={anchor} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
