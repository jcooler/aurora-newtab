import { useRef, useState } from 'react'
import { todayKey } from '../../lib/dates'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import { currentFocus, setFocusText } from './focusLogic'

export default function FocusLine() {
  const [stored, save] = useStoredKey('focus')
  const [editing, setEditing] = useState(false)
  // Guards the submit+blur double-fire: submitting unmounts the input, whose
  // teardown blur re-enters the stale onBlur closure and would save twice.
  const committed = useRef(false)
  if (stored === undefined) return null

  const today = todayKey()
  const focus = currentFocus(stored, today)

  if (!focus || editing) {
    return (
      <form
        className="mt-10 mid:mt-5 short:mt-3 xshort:mt-1 flex flex-col items-center"
        onSubmit={(e) => {
          e.preventDefault()
          committed.current = true
          const input = new FormData(e.currentTarget).get('focus')
          save(setFocusText(String(input ?? ''), today))
          setEditing(false)
        }}
      >
        <label
          htmlFor="focus-input"
          className="text-photo text-base mid:text-sm short:text-sm xshort:text-xs font-medium text-canvas-fg-muted"
        >
          What&rsquo;s your main focus today?
        </label>
        <input
          id="focus-input"
          name="focus"
          autoComplete="off"
          defaultValue={focus?.text ?? ''}
          onBlur={(e) => {
            if (editing && !committed.current) {
              save(setFocusText(e.currentTarget.value, today))
              setEditing(false)
            }
          }}
          className="text-photo mt-2 mid:mt-1 short:mt-0.5 xshort:mt-0.5 w-72 narrow:w-56 border-b border-panel-border bg-transparent pb-1 text-center text-xl mid:text-lg short:text-base xshort:text-sm text-canvas-fg outline-none focus-visible:border-accent"
        />
      </form>
    )
  }

  return (
    <div
      className="group mt-10 mid:mt-5 short:mt-3 xshort:mt-1 flex items-center gap-3 short:gap-2 xshort:gap-1"
      aria-live="polite"
    >
      {/* Round check — the same completion-checkmark control family as
          TodoPanel's task checks, but tuned for the PHOTO: the hairline uses the
          fixed light canvas ink (visible over any image, with a contact shadow)
          rather than the panel's fg-derived token. The real <input> stays
          underneath (sr-only) so keyboard toggle, focus and <label htmlFor>
          association remain the platform's; the `peer` span reflects its state. */}
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
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
        className={`text-photo text-xl mid:text-lg short:text-base xshort:text-sm transition-opacity motion-reduce:transition-none ${
          focus.done ? 'text-canvas-fg-muted line-through opacity-70' : 'text-canvas-fg'
        }`}
      >
        {focus.text}
      </label>
      {focus.done && <span className="text-photo text-sm text-accent">Nice.</span>}
      <button
        type="button"
        onClick={() => {
          committed.current = false
          setEditing(true)
        }}
        className="text-photo text-sm text-canvas-fg-muted opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        Edit
      </button>
    </div>
  )
}
