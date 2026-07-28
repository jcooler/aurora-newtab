import { Suspense, lazy, useRef, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { anchorPanel, type PanelPlacement } from '../../../lib/layout/anchor'

const NotesPanel = lazy(() => import('./NotesPanel'))

// Matches NotesPanel's fixed w-80 h-64 classes exactly.
export const NOTES_PANEL_SIZE = { w: 320, h: 256 }

// Today's fixed classes inset the pill 4rem (64px) from the left edge while
// the panel hugs the true corner at 1rem (16px) — bottom-4 left-16 (pill)
// vs bottom-16 left-4 (panel), a deliberate 3rem (48px) gap baked into the
// original design. anchorPanel aligns the panel's edge directly to the
// pill's edge, so reproducing that tighter corner-hug means feeding it the
// pill's rect shifted left by the same 48px (see Task 35 report for the
// before/after numbers this was verified against).
export const NOTES_CORNER_HUG_PX = 48

export default function NotesWidget() {
  // Gate BEFORE the panel's open/close state exists, same shape as
  // TimerWidget: a disabled widget (settings.widgets.notes starts true, but
  // can be turned off) mounts nothing past the settings read.
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.notes) return null
  return <NotesInner />
}

function NotesInner() {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<PanelPlacement | null>(null)
  const pillRef = useRef<HTMLButtonElement>(null)

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
        left: rect.left - NOTES_CORNER_HUG_PX,
        right: rect.right - NOTES_CORNER_HUG_PX,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
      setAnchor(
        anchorPanel(hugged, NOTES_PANEL_SIZE, { w: window.innerWidth, h: window.innerHeight }),
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
        Notes
      </button>
      {open && anchor && (
        <Suspense fallback={null}>
          <NotesPanel anchor={anchor} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
