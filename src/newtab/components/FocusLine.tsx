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
        className="mt-10 short:mt-3 xshort:mt-1 flex flex-col items-center"
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
          className="text-photo text-base short:text-sm xshort:text-xs font-medium text-fg-muted"
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
          className="text-photo mt-2 short:mt-0.5 xshort:mt-0.5 w-72 narrow:w-56 border-b border-panel-border bg-transparent pb-1 text-center text-xl short:text-base xshort:text-sm text-fg outline-none focus-visible:border-accent"
        />
      </form>
    )
  }

  return (
    <div
      className="group mt-10 short:mt-3 xshort:mt-1 flex items-center gap-3 short:gap-2 xshort:gap-1"
      aria-live="polite"
    >
      <input
        id="focus-done"
        type="checkbox"
        checked={focus.done}
        onChange={() => save({ ...focus, done: !focus.done })}
        className="size-5 accent-(--accent)"
      />
      <label
        htmlFor="focus-done"
        className={`text-photo text-xl short:text-base xshort:text-sm transition-opacity motion-reduce:transition-none ${
          focus.done ? 'text-fg-muted line-through opacity-70' : 'text-fg'
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
        className="text-photo text-sm text-fg-muted opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        Edit
      </button>
    </div>
  )
}
