import { useEffect, useRef, useState } from 'react'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import { todoReducer, type TodoAction } from './todoReducer'

export default function TodoPanel({ onClose }: { onClose: () => void }) {
  const [lists] = useStoredKey('todoLists')
  const storage = useStorage()
  const panelRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [addingList, setAddingList] = useState(false)
  const seeded = useRef(false)

  useFocusTrap(panelRef, true)

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
      className="fixed bottom-16 right-4 z-30 flex w-80 max-h-[70vh] flex-col overflow-hidden rounded-panel border border-panel-border bg-[#17171c]/95 text-fg backdrop-blur-[var(--panel-blur)]"
    >
      <div className="flex items-center justify-between border-b border-panel-border px-3 py-2">
        <h2 className="text-sm font-medium">Tasks</h2>
        <button
          type="button"
          aria-label="Close tasks"
          onClick={onClose}
          className="rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
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
            className={`shrink-0 truncate rounded-full border px-2.5 py-1 text-xs focus-visible:outline-2 focus-visible:outline-accent ${
              list.id === activeId
                ? 'border-accent text-fg'
                : 'border-panel-border text-fg-muted hover:text-fg'
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
              className="w-20 border-b border-panel-border bg-transparent text-xs text-fg outline-none focus-visible:border-accent"
            />
            <button
              type="submit"
              className="text-xs text-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              Add
            </button>
          </form>
        ) : (
          <button
            type="button"
            aria-label="New list"
            onClick={() => setAddingList(true)}
            className="shrink-0 rounded-full border border-dashed border-panel-border px-2.5 py-1 text-xs leading-none text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            +
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {!activeList && <p className="py-4 text-center text-sm text-fg-muted">No lists yet — create one above.</p>}
        {activeList && activeList.items.length === 0 && (
          <p className="py-4 text-center text-sm text-fg-muted">No tasks yet.</p>
        )}
        {activeList && activeList.items.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {activeList.items.map((item, index) => (
              <li key={item.id} className="group flex items-center gap-2">
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
                  className="size-4 shrink-0 accent-(--accent) focus-visible:outline-2 focus-visible:outline-accent"
                />
                <label
                  htmlFor={`todo-item-${item.id}`}
                  className={`flex-1 truncate text-sm ${
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
                  className="shrink-0 text-fg-muted opacity-0 transition hover:text-fg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
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
            className="flex items-center gap-2 border-t border-panel-border px-3 pb-1.5 pt-2"
          >
            <label htmlFor="todo-add-item" className="sr-only">
              Add a task
            </label>
            <input
              id="todo-add-item"
              name="text"
              type="text"
              placeholder="Add a task…"
              className="w-full flex-1 border-b border-panel-border bg-transparent text-sm text-fg outline-none focus-visible:border-accent"
            />
            <button
              type="submit"
              className="shrink-0 text-sm text-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              Add
            </button>
          </form>

          <div className="flex items-center justify-between px-3 pb-2 text-xs">
            <button
              type="button"
              onClick={() => dispatch({ type: 'clearDone', listId: activeList.id })}
              className="rounded border border-transparent px-1.5 py-0.5 text-fg-muted hover:border-panel-border hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              Clear done
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'removeList', listId: activeList.id })}
              className="rounded border border-transparent px-1.5 py-0.5 text-fg-muted hover:border-panel-border hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              Delete list
            </button>
          </div>
        </>
      )}
    </div>
  )
}
