import { useEffect, useRef, useState } from 'react'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'

const SAVE_DEBOUNCE_MS = 500

export default function NotesPanel({ onClose }: { onClose: () => void }) {
  const storage = useStorage()
  const [notes] = useStoredKey('notes')
  const [text, setText] = useState('')

  const focusedRef = useRef(false)
  const textRef = useRef(text)
  textRef.current = text
  const seeded = useRef(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      if (saveTimeoutRef.current === null) return
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
      void storage.set('notes', { text: textRef.current, updatedAt: Date.now() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-once; see comment above
  }, [])

  useDialogEscape(onClose)

  const handleChange = (value: string) => {
    setText(value)
    if (saveTimeoutRef.current !== null) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null
      void storage.set('notes', { text: value, updatedAt: Date.now() })
    }, SAVE_DEBOUNCE_MS)
  }

  if (notes === undefined) return null

  return (
    <div
      role="dialog"
      aria-label="Notes"
      className="fixed bottom-16 left-4 z-30 h-64 w-80 rounded-panel border border-panel-border bg-[#17171c]/95 backdrop-blur-[var(--panel-blur)]"
    >
      <label htmlFor="notes-textarea" className="sr-only">
        Scratchpad
      </label>
      <textarea
        id="notes-textarea"
        autoFocus
        value={text}
        placeholder="Jot something down…"
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={() => {
          focusedRef.current = false
        }}
        onChange={(e) => handleChange(e.currentTarget.value)}
        className="h-full w-full resize-none bg-transparent p-3 text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
      />
    </div>
  )
}
