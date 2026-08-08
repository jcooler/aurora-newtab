import { useEffect, useRef, useState } from 'react'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import type { PanelPlacement } from '../../../lib/layout/anchor'

const SAVE_DEBOUNCE_MS = 500

export default function NotesPanel({
  anchor,
  onClose,
}: {
  anchor: PanelPlacement
  onClose: () => void
}) {
  const storage = useStorage()
  const [notes] = useStoredKey('notes')
  const [text, setText] = useState('')
  // Quiet autosave hint: flipped true when the debounced save commits, then
  // cleared a beat later so the 'Saved' word fades out via a CSS opacity
  // transition (snaps under prefers-reduced-motion). Pure component state — it
  // never touches the 500ms save debounce below, per the panel's freeze.
  const [saved, setSaved] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const focusedRef = useRef(false)
  const textRef = useRef(text)
  textRef.current = text
  const seeded = useRef(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed local state from storage the first time it resolves, unconditionally
  // (the textarea starts empty and unfocused, so there's nothing local to
  // protect yet). After that, an incoming value — from another tab, or this
  // tab's own debounced save echoing back through onChanged — only overwrites
  // the textarea while it's NOT focused: a focused local edit always wins.
  // This makes cross-tab conflicts last-writer-wins (acceptable per the
  // brief), never a lost keystroke in the tab the user is actively typing in.
  useEffect(() => {
    if (notes === undefined) return
    if (!seeded.current) {
      seeded.current = true
      setText(notes.text)
      return
    }
    if (!focusedRef.current) setText(notes.text)
  }, [notes])

  // Flush any pending debounced save when the panel unmounts — whether that's
  // Escape, re-clicking the pill, or the widget's own disable toggle. Reads
  // the latest text via textRef rather than closing over `text`, since this
  // effect must stay mount-once (register/unregister exactly once) rather
  // than re-running on every keystroke.
  //
  // Known gap: an abrupt tab close/reload can still race ahead of this
  // effect's async storage.set before it finishes — this only guarantees the
  // save is *started*, not durably committed before teardown. Worst case is
  // the same up-to-500ms window the debounce already accepts.
  useEffect(() => {
    return () => {
      // Clear the 'Saved'-flash timer first (always), so it can't fire a
      // setState after unmount — independent of the save-flush below.
      if (flashTimeoutRef.current !== null) clearTimeout(flashTimeoutRef.current)
      if (saveTimeoutRef.current === null) return
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
      void storage.set('notes', { text: textRef.current, updatedAt: Date.now() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-once; see comment above
  }, [])

  // `active` is gated on readiness (`notes !== undefined`), NOT hardcoded
  // `true` the way TodoPanel calls it. This component's dialog div only
  // enters the JSX once `notes` has resolved (see the early-return below),
  // so its FIRST render is always `null` — `panelRef.current` doesn't exist
  // yet. useFocusTrap's effect deps are `[ref, active]`; if `active` were a
  // constant `true` from that first render onward, the effect would run
  // exactly once (while `ref.current` is still null), see nothing to trap,
  // and never run again — deps never change, so React never re-invokes it,
  // even once the dialog div (and its ref) shows up on a later render. Tying
  // `active` to the SAME condition that gates the ref-bearing JSX (like
  // TimerWidget ties its focus trap to `open`, the same flag that gates its
  // panel div) makes `active` flip false -> true on exactly the render where
  // `panelRef.current` first becomes non-null, which is what actually
  // triggers useFocusTrap's initial-focus + Tab-trap + close-time restore.
  const ready = notes !== undefined
  useFocusTrap(panelRef, ready)

  // Gated on `ready` (same flag useFocusTrap above uses), not the default
  // `true`: unlike TodoPanel, this panel's data can still be loading when it
  // mounts (see the `ready` comment above), and registering the stack entry
  // before then would let an Escape press during that <100ms window close
  // whatever dialog is stacked below Notes instead of doing nothing here.
  useDialogEscape(onClose, ready)

  const handleChange = (value: string) => {
    setText(value)
    if (saveTimeoutRef.current !== null) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null
      void storage.set('notes', { text: value, updatedAt: Date.now() })
      // Quiet 'Saved' flash on commit (never blocks or alters the write above):
      // show it, then clear after a beat so the label fades back out.
      setSaved(true)
      if (flashTimeoutRef.current !== null) clearTimeout(flashTimeoutRef.current)
      flashTimeoutRef.current = setTimeout(() => {
        flashTimeoutRef.current = null
        setSaved(false)
      }, 1400)
    }, SAVE_DEBOUNCE_MS)
  }

  if (notes === undefined) return null

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notes"
      // `anchor` is `{left,top}` (opens downward) or `{left,bottom}` (opens
      // upward) — review fix I1; see anchor.ts's PanelPlacement doc. Notes'
      // own panel is fixed-height (h-64), so this branch only ever affects
      // WHICH edge pins it, never a clipping concern the way TodoPanel's
      // growing list is — but it still has to handle both shapes, since its
      // default (bottom-4) pill placement is itself in the bottom half.
      style={{
        position: 'fixed',
        left: anchor.left,
        ...('top' in anchor ? { top: anchor.top } : { bottom: anchor.bottom }),
      }}
      className="z-30 flex h-64 w-80 flex-col overflow-hidden rounded-panel border border-panel-border bg-panel-solid shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]"
    >
      <div className="flex items-center justify-between px-3.5 pb-1 pt-2.5">
        <h2 className="text-sm font-semibold tracking-tight text-fg">Notes</h2>
        {/* Autosave hint — decorative (the textarea is the accessible control);
            fades on the opacity transition, snaps under motion-reduce. */}
        <span
          aria-hidden
          className={`text-xs text-fg-muted transition-opacity duration-500 motion-reduce:transition-none ${
            saved ? 'opacity-100' : 'opacity-0'
          }`}
        >
          Saved
        </span>
      </div>
      <label htmlFor="notes-textarea" className="sr-only">
        Scratchpad
      </label>
      <textarea
        id="notes-textarea"
        value={text}
        placeholder="Jot a thought, a link, a to-do…"
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={() => {
          focusedRef.current = false
        }}
        onChange={(e) => handleChange(e.currentTarget.value)}
        className="w-full flex-1 resize-none bg-transparent px-3.5 pb-3.5 pt-1 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      />
    </div>
  )
}
