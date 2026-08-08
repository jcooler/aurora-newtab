import { useEffect, useRef, useState } from 'react'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import type { PanelPlacement } from '../../../lib/layout/anchor'
import { todoReducer, type TodoAction } from './todoReducer'
// The control kit (Task 61) — the panels' add-input + submit button speak the
// SAME language as every Settings field by using the exact same class strings,
// not a look-alike copy. See src/settings/sections/shared.ts for the rationale.
import { control, submitBtn } from '../../../settings/sections/shared'

export default function TodoPanel({
  anchor,
  onClose,
}: {
  anchor: PanelPlacement
  onClose: () => void
}) {
  const [lists] = useStoredKey('todoLists')
  const storage = useStorage()
  const panelRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [addingList, setAddingList] = useState(false)
  const seeded = useRef(false)

  // `active` is gated on readiness (`lists !== undefined`), NOT hardcoded
  // `true`. This component's dialog div only enters the JSX once `lists` has
  // resolved (see the early-return below), so its FIRST render is always
  // `null` — `panelRef.current` doesn't exist yet. useFocusTrap's effect deps
  // are `[ref, active]`; if `active` were a constant `true` from that first
  // render onward, the effect would run exactly once (while `ref.current` is
  // still null), see nothing to trap, and never run again — deps never
  // change, so React never re-invokes it, even once the dialog div (and its
  // ref) shows up on a later render. Tying `active` to the SAME condition
  // that gates the ref-bearing JSX makes `active` flip false -> true on
  // exactly the render where `panelRef.current` first becomes non-null,
  // which is what actually triggers useFocusTrap's initial-focus + Tab-trap
  // + close-time restore. (Same fix as NotesPanel.tsx, Task 27.)
  useFocusTrap(panelRef, lists !== undefined)

  // Newest-first shared stack (src/lib/dialogStack.ts): this panel only
  // mounts while open, so it's always active.
  useDialogEscape(onClose)

  const dispatch = (action: TodoAction) =>
    void storage.update('todoLists', (current) => todoReducer(current, action))

  // Auto-create a starter list the first time the panel is opened on an empty board.
  // The emptiness check is re-done INSIDE the update transform (closest read to
  // write) so a second tab opening the panel at the same time is a safe no-op:
  // storage.update() re-reads fresh state right before writing, so if another
  // tab's "Today" has already landed by then, this transform returns the SAME
  // array reference — which the chrome-faithful driver never turns into a
  // write event, so there's no visible flicker/duplicate from the race.
  useEffect(() => {
    if (lists === undefined || seeded.current) return
    seeded.current = true
    if (lists.length === 0) {
      void storage.update('todoLists', (current) =>
        current.length === 0
          ? todoReducer(current, { type: 'addList', name: 'Today' })
          : current,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per mount, not per dispatch identity
  }, [lists])

  // Default the active tab to the first list, and fall back whenever the
  // current one disappears (e.g. after "Delete list").
  useEffect(() => {
    if (!lists || lists.length === 0) {
      setActiveId(null)
      return
    }
    if (!activeId || !lists.some((l) => l.id === activeId)) {
      setActiveId(lists[0]!.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check when the list set changes
  }, [lists])

  if (lists === undefined) return null

  const activeList = lists.find((l) => l.id === activeId) ?? null

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Tasks"
      // `anchor` is `{left,top}` (opens downward) or `{left,bottom}` (opens
      // upward, growing UP so the add-task form + Clear-done row below the
      // list never march off-screen as it grows past ~5 tasks — review fix
      // I1; see anchor.ts's PanelPlacement doc).
      style={{
        position: 'fixed',
        left: anchor.left,
        ...('top' in anchor ? { top: anchor.top } : { bottom: anchor.bottom }),
      }}
      className="z-30 flex w-80 max-h-[70vh] flex-col overflow-hidden rounded-panel border border-panel-border bg-panel-solid text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]"
    >
      <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Tasks</h2>
          {activeList && activeList.items.length > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-control-bg px-1.5 text-[11px] font-medium tabular-nums text-fg-muted">
              {activeList.items.length}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="Close tasks"
          onClick={onClose}
          className="-mr-1 rounded p-1 text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          ✕
        </button>
      </div>

      <div
        aria-label="Lists"
        className="flex items-center gap-1.5 overflow-x-auto px-3 pb-1 pt-2"
      >
        {lists.map((list) => (
          <button
            key={list.id}
            type="button"
            aria-pressed={list.id === activeId}
            onClick={() => setActiveId(list.id)}
            className={`shrink-0 truncate rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none ${
              list.id === activeId
                ? 'border-accent bg-accent/10 text-fg'
                : 'border-control-border text-fg-muted hover:bg-control-bg hover:text-fg'
            }`}
          >
            {list.name}
          </button>
        ))}
        {addingList ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const data = new FormData(e.currentTarget)
              dispatch({ type: 'addList', name: String(data.get('name') ?? '') })
              setAddingList(false)
            }}
            className="flex shrink-0 items-center gap-1"
          >
            <label htmlFor="todo-new-list" className="sr-only">
              New list name
            </label>
            <input
              id="todo-new-list"
              name="name"
              autoFocus
              type="text"
              placeholder="List name"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation() // cancel the draft, don't close the whole panel
                  setAddingList(false)
                }
              }}
              className="w-20 border-b border-control-border bg-transparent text-xs text-fg outline-none transition-colors focus-visible:border-accent motion-reduce:transition-none"
            />
            <button type="submit" className={`${submitBtn} text-xs`}>
              Add
            </button>
          </form>
        ) : (
          <button
            type="button"
            aria-label="New list"
            onClick={() => setAddingList(true)}
            className="shrink-0 rounded-full border border-dashed border-control-border px-2.5 py-1 text-xs leading-none text-fg-muted transition-colors hover:border-control-border hover:bg-control-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            +
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!activeList && (
          <p className="py-6 text-center text-sm text-fg-muted">No lists yet — create one above.</p>
        )}
        {activeList && activeList.items.length === 0 && (
          <p className="py-6 text-center text-sm text-fg-muted">Nothing yet — add your first task.</p>
        )}
        {activeList && activeList.items.length > 0 && (
          <ul className="flex flex-col">
            {activeList.items.map((item, index) => (
              <li
                key={item.id}
                className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-control-bg motion-reduce:transition-none"
              >
                {/* Round check — the completion-checkmark control family (also on
                    FocusLine): a 20px circle with a fg-derived hairline that
                    fills with accent + a near-black glyph when done. The real
                    <input type=checkbox> stays underneath (sr-only) so keyboard
                    activation, the alt+arrow reorder, focus and <label htmlFor>
                    association are all still the platform's, not hand-rolled;
                    the styled span is a `peer` sibling that reflects its state. */}
                <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    id={`todo-item-${item.id}`}
                    checked={item.done}
                    onChange={() =>
                      dispatch({ type: 'toggleItem', listId: activeList.id, itemId: item.id })
                    }
                    onKeyDown={(e) => {
                      if (!e.altKey) return
                      if (e.key === 'ArrowUp' && index > 0) {
                        e.preventDefault()
                        dispatch({
                          type: 'moveItem',
                          listId: activeList.id,
                          from: index,
                          to: index - 1,
                        })
                      } else if (e.key === 'ArrowDown' && index < activeList.items.length - 1) {
                        e.preventDefault()
                        dispatch({
                          type: 'moveItem',
                          listId: activeList.id,
                          from: index,
                          to: index + 1,
                        })
                      }
                    }}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className="grid size-5 place-items-center rounded-full border border-control-border text-transparent transition-colors peer-checked:border-accent peer-checked:bg-accent peer-checked:text-[#0a0a0a] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent motion-reduce:transition-none"
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
                  htmlFor={`todo-item-${item.id}`}
                  className={`flex-1 cursor-pointer truncate text-sm transition-colors motion-reduce:transition-none ${
                    item.done ? 'text-fg-muted line-through' : 'text-fg'
                  }`}
                >
                  {item.text}
                </label>
                <button
                  type="button"
                  aria-label={`Delete ${item.text}`}
                  onClick={() =>
                    dispatch({ type: 'removeItem', listId: activeList.id, itemId: item.id })
                  }
                  className="shrink-0 cursor-pointer rounded p-0.5 text-fg-muted opacity-0 transition hover:text-fg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {activeList && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const data = new FormData(e.currentTarget)
              const text = String(data.get('text') ?? '')
              dispatch({ type: 'addItem', listId: activeList.id, text })
              e.currentTarget.reset()
            }}
            className="flex items-center gap-2 border-t border-hairline px-3.5 pb-2 pt-3"
          >
            <label htmlFor="todo-add-item" className="sr-only">
              Add a task
            </label>
            <input
              id="todo-add-item"
              name="text"
              type="text"
              placeholder="Add a task…"
              className={`${control} flex-1`}
            />
            <button type="submit" className={submitBtn}>
              Add
            </button>
          </form>

          <div className="flex items-center justify-between px-3.5 pb-2.5 text-xs">
            <button
              type="button"
              onClick={() => dispatch({ type: 'clearDone', listId: activeList.id })}
              className="cursor-pointer rounded px-1.5 py-0.5 text-fg-muted transition-colors hover:bg-control-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              Clear done
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'removeList', listId: activeList.id })}
              className="cursor-pointer rounded px-1.5 py-0.5 text-fg-muted transition-colors hover:bg-control-bg hover:text-red-300 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              Delete list
            </button>
          </div>
        </>
      )}
    </div>
  )
}
