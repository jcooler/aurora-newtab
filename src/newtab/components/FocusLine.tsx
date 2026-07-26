import { useState } from 'react'
import { todayKey } from '../../lib/dates'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import { currentFocus, setFocusText } from './focusLogic'

export default function FocusLine() {
  const [stored, save] = useStoredKey('focus')
  const [editing, setEditing] = useState(false)
  if (stored === undefined) return null

  const today = todayKey()
  const focus = currentFocus(stored, today)

  if (!focus || editing) {
    return (
      <form
        className="mt-10 flex flex-col items-center"
        onSubmit={(e) => {
          e.preventDefault()
          const input = new FormData(e.currentTarget).get('focus')
          save(setFocusText(String(input ?? ''), today))
          setEditing(false)
        }}
      >
        <label htmlFor="focus-input" className="text-lg font-light text-fg-muted">
          What&rsquo;s your main focus today?
        </label>
        <input
          id="focus-input"
          name="focus"
          autoComplete="off"
          defaultValue={focus?.text ?? ''}
          onBlur={(e) => {
            if (editing) {
              save(setFocusText(e.currentTarget.value, today))
              setEditing(false)
            }
          }}
          className="mt-2 w-72 border-b border-panel-border bg-transparent pb-1 text-center text-xl text-fg outline-none focus-visible:border-accent"
        />
      </form>
    )
  }

  return (
    <div className="group mt-10 flex items-center gap-3" aria-live="polite">
      <input
        id="focus-done"
        type="checkbox"
        checked={focus.done}
        onChange={() => save({ ...focus, done: !focus.done })}
        className="size-5 accent-(--accent)"
      />
      <label
        htmlFor="focus-done"
        className={`text-xl transition-opacity motion-reduce:transition-none ${
          focus.done ? 'text-fg-muted line-through opacity-70' : 'text-fg'
        }`}
      >
        {focus.text}
      </label>
      {focus.done && <span className="text-sm text-accent">Nice.</span>}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sm text-fg-muted opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        Edit
      </button>
    </div>
  )
}
