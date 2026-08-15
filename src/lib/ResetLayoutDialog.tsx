import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDialogEscape } from './dialogStack'
import { useFocusTrap } from './hooks/useFocusTrap'

/** The shared destructive-confirm dialog behind every "Reset layout"
 *  control in Aurora — the arrange-mode pill's own danger-styled Reset
 *  button (src/newtab/arrange/ArrangeController.tsx) and Settings' Layout
 *  section (src/settings/sections/Layout.tsx), which otherwise never import
 *  from each other; this one small piece of UI lives in `lib` instead of
 *  either feature tree so both can share it.
 *
 *  Replaces the old two-click "arm, then auto-expire" idiom (useArmedConfirm,
 *  since removed) per explicit user feedback: a whole button silently
 *  relabeling itself mid-interaction, with only a few seconds before it
 *  quietly reverts, is a bad pattern for a destructive action. A real dialog
 *  with a plain-language warning and an explicit Cancel replaces it.
 *
 *  Portals to `document.body` rather than rendering as a plain descendant:
 *  both call sites can sit inside an ancestor with a CSS `transform` — the
 *  Settings Drawer's own sliding panel uses `translate-x-0`/`translate-x-full`
 *  (src/settings/Drawer.tsx) — and any non-`none` transform on an ancestor
 *  becomes the containing block for `position: fixed` descendants, silently
 *  shrinking a viewport-centered overlay down to that ancestor's own box
 *  (same reasoning FolderPopover.tsx documents for its own portal). Portaling
 *  to `body` sidesteps that regardless of which call site renders it.
 *
 *  `z-[70]` — deliberately above the arrange-mode overlay's own `z-[60]`
 *  (ArrangeController) so this stays interactive and fully visible when
 *  triggered mid-arrange; harmless overkill above the Drawer's `z-50` /
 *  Palette's `z-50` when triggered from Settings instead.
 *
 *  Registers on the shared Escape stack (`useDialogEscape`) only while
 *  `open` — so it's the newest (topmost) entry whenever it's actually
 *  showing, meaning Escape cancels THIS dialog first (arrange mode's own
 *  exit, or the Settings Drawer's close, registered earlier and so sit
 *  underneath either way), and it stops competing for Escape the instant
 *  it closes.
 *
 *  `useFocusTrap`'s `active` param is tied to the SAME `open` flag that
 *  gates the dialog's own ref-bearing markup below — the "ready-predicate"
 *  idiom TimerWidget/TodoPanel/NotesPanel already use: `open` flips
 *  false -> true on exactly the render where `dialogRef.current` first
 *  becomes non-null, which is what lets the trap find something to
 *  focus/wrap Tab around in the first place.
 *
 *  Cancel renders FIRST in DOM order (not "Reset layout") so the trap's
 *  default "focus the first focusable element" behavior lands there — the
 *  safe default the brief asks for, with no special-casing needed in
 *  useFocusTrap itself. */
export default function ResetLayoutDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useFocusTrap(dialogRef, open)
  useDialogEscape(onCancel, open)

  if (!open) return null

  return createPortal(
    <>
      <div aria-hidden onClick={onCancel} className="fixed inset-0 z-[70] bg-black/30" />
      <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Reset layout?"
          className="pointer-events-auto max-h-[calc(100dvh-1rem)] w-full max-w-sm overflow-y-auto rounded-panel border border-panel-border bg-panel-solid p-5 text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] [@media(max-height:300px)]:p-3"
        >
          <h2 className="mb-2 text-base font-semibold">Reset layout?</h2>
          <p className="mb-4 text-sm text-fg-muted">
            Every widget returns to its default position. This can&apos;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-9 rounded-full border border-panel-border px-3 py-1 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="min-h-9 rounded-full border border-panel-border px-3 py-1 text-sm text-red-400 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Reset layout
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
