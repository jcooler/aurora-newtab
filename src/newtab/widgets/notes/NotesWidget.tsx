import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useViewportPanelAnchor } from '../../../lib/hooks/useViewportPanelAnchor'
import { hugHorizontal } from '../../../lib/layout/anchor'
import type { NotesPanelHandle } from './NotesPanel'
import { createPortal } from 'react-dom'
import type { UtilityTrayBridge } from '../../components/utilityTrayBridge'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import TierFrame from '../shared/TierFrame'
import type { WidgetPresentationMode } from '../../widgetRenderers'

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
  utilityTray,
  canvasSize = 'compact',
  docked = false,
  presentation = 'free',
}: {
  onOpenChange?: (open: boolean) => void
  utilityTray?: UtilityTrayBridge
  canvasSize?: CanvasSize
  docked?: boolean
  presentation?: WidgetPresentationMode
} = {}) {
  // Keep NotesInner mounted across a settings disable so an open dirty panel
  // can finish (or recover) its authority-backed close before disappearing.
  // Once it is disabled and closed, NotesInner renders nothing.
  const [settings] = useStoredKey('settings')
  const [notes] = useStoredKey('notes')
  if (!settings) return null
  return (
    <NotesInner
      enabled={settings.widgets.notes}
      onOpenChange={onOpenChange}
      utilityTray={utilityTray}
      canvasSize={canvasSize}
      docked={docked}
      hasSavedNote={Boolean(notes?.text.trim())}
      noteUpdatedAt={notes?.updatedAt ?? 0}
      presentation={presentation}
    />
  )
}

function NotesInner({
  enabled,
  onOpenChange,
  utilityTray,
  canvasSize,
  docked,
  hasSavedNote,
  noteUpdatedAt,
  presentation,
}: {
  enabled: boolean
  onOpenChange?: (open: boolean) => void
  utilityTray?: UtilityTrayBridge
  canvasSize: CanvasSize
  docked: boolean
  hasSavedNote: boolean
  noteUpdatedAt: number
  presentation: WidgetPresentationMode
}) {
  const [open, setOpen] = useState(false)
  const pillRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<NotesPanelHandle>(null)
  const viewportPanelRef = useRef<HTMLDivElement>(null)
  const mapInvokerRect = useCallback(
    (rect: DOMRectReadOnly, viewportWidth: number) =>
      hugHorizontal(rect, NOTES_CORNER_HUG_PX, viewportWidth),
    [],
  )
  const anchor = useViewportPanelAnchor({
    open: utilityTray ? false : open,
    invokerRef: pillRef,
    panelRef: viewportPanelRef,
    preferredSize: NOTES_PANEL_SIZE,
    mapInvokerRect,
  })

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

  // The panel follows the pill and live rendered panel size while open.
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
    if (utilityTray && pillRef.current) {
      utilityTray.requestTool('notes', pillRef.current)
      return
    }
    if (open) {
      void requestPanelClose()
      return
    }
    if (!enabled) return
    setOpen(true)
  }

  const panelOpen = utilityTray ? utilityTray.activeTool === 'notes' : open

  useEffect(() => {
    if (!utilityTray || !panelOpen) return
    utilityTray.registerCloseGuard('notes', async () => panelRef.current?.flushLatest() ?? true)
    return () => utilityTray.registerCloseGuard('notes', null)
  }, [panelOpen, utilityTray])

  if (!enabled && !panelOpen) return null

  const panel = panelOpen && (utilityTray?.host || anchor) ? (
    <Suspense fallback={null}>
      <NotesPanel
        ref={panelRef}
        anchor={anchor ?? undefined}
        embedded={Boolean(utilityTray)}
        onClose={utilityTray ? utilityTray.close : () => setOpen(false)}
        viewportRef={(node) => { viewportPanelRef.current = node }}
      />
    </Suspense>
  ) : null
  const trigger = enabled ? (
    <button
      ref={pillRef}
      type="button"
      aria-label="Notes"
      aria-expanded={panelOpen}
      onClick={togglePanel}
      data-testid={docked ? 'notes-dock' : undefined}
      className={docked
        ? 'flex max-w-80 items-center gap-2 rounded-panel border border-panel-border bg-panel-solid px-3 py-2 text-sm text-fg-muted shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent'
        : 'flex h-full w-full cursor-pointer flex-col items-stretch justify-center gap-2 rounded-[inherit] p-3 text-left focus-visible:outline-2 focus-visible:outline-accent'}
    >
      {docked ? (
        <strong className="shrink-0 font-semibold text-fg">Notes</strong>
      ) : (
        <>
          <span className="flex items-center justify-between">
            <strong className="text-sm font-semibold text-fg">Notes</strong>
            <span className="text-[11px] text-fg-muted">{hasSavedNote ? (noteUpdatedAt ? 'Edited recently' : 'Saved note') : 'Scratchpad'}</span>
          </span>
          <span className="text-sm leading-5 text-fg-muted">
            Your note stays private until you open it.
          </span>
          <span className="mt-auto text-sm font-medium text-fg">Open notes</span>
        </>
      )}
    </button>
  ) : null

  return (
    <>
      {trigger && (docked ? trigger : (
        <TierFrame label="Notes card" tier={canvasSize === 'compact' ? canvasSize : 'compact'} state="ready">
          <div data-notes-presentation={presentation} className="h-full">{trigger}</div>
        </TierFrame>
      ))}
      {utilityTray?.host && panel ? createPortal(panel, utilityTray.host) : panel}
    </>
  )
}
