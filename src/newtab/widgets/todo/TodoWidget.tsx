import { Suspense, lazy, useRef, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { anchorPanel, type PanelPlacement } from '../../../lib/layout/anchor'

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
// pill's rect shifted right by the same 48px (see Task 35 report for the
// before/after numbers this was verified against).
export const TODO_CORNER_HUG_PX = 48

export default function TodoWidget() {
  const [settings] = useStoredKey('settings')
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<PanelPlacement | null>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  if (!settings?.widgets.todo) return null

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
      const hugged = {
        left: rect.left + TODO_CORNER_HUG_PX,
        right: rect.right + TODO_CORNER_HUG_PX,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
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
        className="rounded-panel border border-panel-border bg-panel px-3 py-2 text-sm text-fg backdrop-blur-[var(--panel-blur)] hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
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
