import { useEffect, useRef, useState } from 'react'
import { useLocalDay } from '../../lib/hooks/useLocalDay'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import { currentFocus, setFocusText } from './focusLogic'

export default function FocusLine() {
  const [stored, save] = useStoredKey('focus')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const committed = useRef(false)
  const canceled = useRef(false)
  const restoreEditFocus = useRef(false)
  const editorDay = useRef<string | null>(null)
  const { key: today } = useLocalDay()
  const focus = stored === undefined ? null : currentFocus(stored, today)

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  useEffect(() => {
    if (editing || !restoreEditFocus.current) return
    restoreEditFocus.current = false
    editRef.current?.focus()
  }, [editing, focus])

  function beginEdit() {
    committed.current = false
    canceled.current = false
    editorDay.current = today
    setDraft(focus?.text ?? '')
    setEditing(true)
  }

  function commitDraft(value: string, restoreFocus: boolean) {
    if (committed.current || canceled.current) return
    const ownerDay = editorDay.current ?? today
    if (ownerDay !== today) {
      canceled.current = true
      restoreEditFocus.current = false
      editorDay.current = null
      setDraft('')
      setEditing(false)
      return
    }
    const next = setFocusText(value, today)
    if (next === null) {
      if (focus !== null) save(null)
      committed.current = false
      editorDay.current = null
      setDraft('')
      setEditing(false)
      return
    }
    committed.current = true
    if (restoreFocus && focus !== null) restoreEditFocus.current = true
    editorDay.current = null
    save(next)
    setEditing(false)
  }

  function cancelEdit() {
    if (!editing) return
    canceled.current = true
    restoreEditFocus.current = focus !== null
    editorDay.current = null
    setDraft('')
    setEditing(false)
  }

  if (stored === undefined) return null

  return (
    <div
      data-focus-footprint=""
      data-focus-state={!focus ? 'empty' : editing ? 'editing' : focus.done ? 'completed' : 'committed'}
      className="grid h-full min-h-0 w-full place-items-center"
      aria-live="polite"
    >
      {!focus || editing ? (
      <form
        className="flex w-full flex-col items-center"
        onSubmit={(e) => {
          e.preventDefault()
          commitDraft(draft, true)
        }}
      >
        <label
          htmlFor="focus-input"
          data-canvas-type-role="support"
          className="text-photo text-base mid:text-sm short:text-sm xshort:text-xs font-medium text-canvas-fg"
        >
          What&rsquo;s your main focus today?
        </label>
        <input
          ref={inputRef}
          id="focus-input"
          name="focus"
          autoComplete="off"
          data-canvas-type-role="support"
          value={draft}
          onFocus={() => {
            editorDay.current ??= today
          }}
          onChange={(e) => {
            committed.current = false
            canceled.current = false
            editorDay.current ??= today
            setDraft(e.currentTarget.value)
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            e.preventDefault()
            cancelEdit()
          }}
          onBlur={(e) => {
            commitDraft(e.currentTarget.value, false)
          }}
          className="text-photo mt-2 mid:mt-1 short:mt-0.5 xshort:mt-0.5 min-h-9 w-72 narrow:w-56 border-b border-panel-border bg-transparent pb-1 text-center text-xl mid:text-lg short:text-base xshort:text-sm text-canvas-fg outline-none focus-visible:border-accent -mb-[3px] short:mb-0 xshort:mb-0"
        />
      </form>
      ) : (
      <div className="group flex items-center gap-3 short:gap-2 xshort:gap-1">
      {/* Round check — the same completion-checkmark control family as
          TodoPanel's task checks, but tuned for the PHOTO: the hairline uses the
          fixed light canvas ink (visible over any image, with a contact shadow)
          rather than the panel's fg-derived token. The real <input> stays
          underneath (sr-only) so keyboard toggle, focus and <label htmlFor>
          association remain the platform's; the `peer` span reflects its state. */}
      <label className="relative inline-flex min-h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center">
        <input
          id="focus-done"
          type="checkbox"
          checked={focus.done}
          onChange={() => save({ ...focus, done: !focus.done })}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="grid size-5 place-items-center rounded-full border border-canvas-fg-muted text-transparent shadow-[0_1px_3px_rgb(0_0_0/0.45)] transition-colors peer-checked:border-accent peer-checked:bg-accent peer-checked:text-[#0a0a0a] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent motion-reduce:transition-none"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>
      </label>
      <label
        htmlFor="focus-done"
        data-canvas-type-role="support"
        className={`text-photo text-xl mid:text-lg short:text-base xshort:text-sm transition-opacity motion-reduce:transition-none ${
          focus.done ? 'text-canvas-fg-muted line-through opacity-70' : 'text-canvas-fg'
        }`}
      >
        {focus.text}
      </label>
      {focus.done && <span data-canvas-type-role="metadata" className="text-photo text-sm text-accent">Nice.</span>}
      <button
        ref={editRef}
        type="button"
        onClick={beginEdit}
        className="text-photo inline-flex min-h-9 min-w-9 items-center justify-center text-sm text-canvas-fg-muted opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        Edit
      </button>
      </div>
      )}
    </div>
  )
}
