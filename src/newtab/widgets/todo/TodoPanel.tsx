import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import type { PanelPlacement } from '../../../lib/layout/anchor'
import { todoReducer, type TodoAction } from './todoReducer'

// Direction C — "the dense command-list" (Jon's pick; reference render
// screenshots/options/tasks-C-command*.png). Compact 32px rows carrying a
// decorative two-digit mono line number and the approved 20px round check;
// the header switches lists via uppercase eyebrows and shows a derived
// progress ring; a single terminal-style command line at the foot adds tasks.
// The behaviour contract underneath is unchanged from the previous panel —
// todoReducer, the focus trap gate that mirrors the JSX gate, the shared
// Escape stack, the sr-only <input>+styled-<span> round-check wiring, and the
// multi-list model (add / clear-done / delete-list) all survive the restyle.

/** Derived-only progress ring — no state, pure function of done/total. Accent
 *  arc (rgb(125,211,252), the pixel-sampled colour of the picked render's ring)
 *  over a faint track. The svg is decorative; the parent span carries the
 *  accessible name ("2 of 6 done"). */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 7
  const circumference = 2 * Math.PI * r
  const frac = total > 0 ? done / total : 0
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] shrink-0" aria-hidden>
      <circle cx="9" cy="9" r={r} fill="none" strokeWidth="2" className="stroke-fg-muted/25" />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        className="stroke-accent transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - frac)}
        transform="rotate(-90 9 9)"
      />
    </svg>
  )
}

/** The list-level destructive actions (Clear done / Delete list) live behind a
 *  quiet "⋯" overflow so the surface stays as spare as the render — the render
 *  shows no footer actions. Dismissal follows the house popover pattern
 *  (FolderPopover): a body-level transparent click-catcher plus the shared
 *  newest-first Escape stack (useDialogEscape). This inner component only
 *  mounts while open, so its Escape registration sits ABOVE the panel's own on
 *  the stack — one Escape closes the menu, a second closes the panel. */
function OverflowMenuList({
  onClose,
  onClearDone,
  onDeleteList,
  hasDone,
  trigger,
  owner,
}: {
  onClose: () => void
  onClearDone: () => void
  onDeleteList: () => void
  hasDone: boolean
  trigger: HTMLButtonElement
  owner: HTMLDivElement
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  useDialogEscape(onClose)

  useLayoutEffect(() => {
    let frame: number | null = null
    const measure = () => {
      frame = null
      const menu = menuRef.current
      if (!menu) return
      const triggerRect = trigger.getBoundingClientRect()
      const menuRect = menu.getBoundingClientRect()
      const width = menuRect.width || 160
      const height = menuRect.height
      const maxLeft = Math.max(8, window.innerWidth - 8 - width)
      const viewportLeft = Math.min(Math.max(8, triggerRect.right - width), maxLeft)
      const below = triggerRect.bottom + 6
      const viewportTop =
        height > 0 && below + height > window.innerHeight - 8
          ? Math.max(8, triggerRect.top - 6 - height)
          : Math.max(8, Math.min(below, window.innerHeight - 8 - height))
      const ownerRect = owner.getBoundingClientRect()
      const left = viewportLeft - ownerRect.left
      const top = viewportTop - ownerRect.top
      setPosition((current) =>
        current.left === left && current.top === top ? current : { left, top },
      )
    }
    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('resize', schedule)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(trigger)
    observer?.observe(menuRef.current!)
    return () => {
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [owner, trigger])

  useLayoutEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
  }, [])

  useEffect(() => {
    const consumeOwnerClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node) || !owner.contains(target) || menuRef.current?.contains(target)) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('click', consumeOwnerClick, true)
    return () => document.removeEventListener('click', consumeOwnerClick, true)
  }, [onClose, owner])

  return (
    <>
      {/* The whole Tasks dialog is a body-level z-50 owner while this menu is
          open. Its body-level z-40 catcher therefore owns every point outside
          Tasks; the capture listener above consumes points inside Tasks but
          outside this menu, without letting the underlying control activate. */}
      {createPortal(
        <div
          aria-hidden
          onPointerDown={(event) => event.preventDefault()}
          onClick={onClose}
          className="fixed inset-0 z-40"
        />,
        document.body,
      )}
      {/* Keep the actions as real descendants of the Tasks dialog. The parent
          focus trap then owns one sequential Tab order, including this menu. */}
      <div
        ref={menuRef}
        id="todo-overflow-menu"
        aria-label="Task list actions"
        style={{ position: 'absolute', left: position.left, top: position.top }}
        className="z-50 max-h-[calc(100dvh-1rem)] min-w-40 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-panel border border-panel-border bg-panel-solid p-1 text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]"
      >
        <button
          type="button"
          disabled={!hasDone}
          onClick={() => {
            onClearDone()
            onClose()
          }}
          className="flex w-full cursor-pointer items-center rounded px-2 py-1.5 text-left text-sm text-fg-muted transition-colors hover:bg-control-bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted max-[420px]:min-h-9 motion-reduce:transition-none"
        >
          Clear done
        </button>
        <button
          type="button"
          onClick={() => {
            onDeleteList()
            onClose()
          }}
          className="flex w-full cursor-pointer items-center rounded px-2 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-control-bg-hover hover:text-red-300 focus-visible:outline-2 focus-visible:outline-accent max-[420px]:min-h-9 motion-reduce:transition-none"
        >
          Delete list
        </button>
      </div>
    </>
  )
}

function OverflowMenu({
  onClearDone,
  onDeleteList,
  hasDone,
  owner,
  onOpenChange,
}: {
  onClearDone: () => void
  onDeleteList: () => void
  hasDone: boolean
  owner: HTMLDivElement
  onOpenChange: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="More actions"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? 'todo-overflow-menu' : undefined}
        onClick={() =>
          setOpen((current) => {
            onOpenChange(!current)
            return !current
          })
        }
        className="grid size-6 cursor-pointer place-items-center rounded text-base leading-none text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent max-[420px]:size-9 motion-reduce:transition-none"
      >
        <span aria-hidden>⋯</span>
      </button>
      {open && (
        <OverflowMenuList
          hasDone={hasDone}
          trigger={triggerRef.current!}
          owner={owner}
          onClearDone={onClearDone}
          onDeleteList={onDeleteList}
          onClose={() => {
            setOpen(false)
            onOpenChange(false)
            triggerRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}

export default function TodoPanel({
  anchor,
  onClose,
  viewportRef,
}: {
  anchor: PanelPlacement
  onClose: () => void
  viewportRef?: (node: HTMLDivElement | null) => void
}) {
  const [lists] = useStoredKey('todoLists')
  const storage = useStorage()
  const panelRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [addingList, setAddingList] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
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
  const total = activeList?.items.length ?? 0
  const doneCount = activeList?.items.filter((i) => i.done).length ?? 0

  return createPortal(
    <div
      ref={(node) => {
        panelRef.current = node
        viewportRef?.(node)
      }}
      role="dialog"
      aria-label="Tasks"
      // `anchor` is `{left,top}` (opens downward) or `{left,bottom}` (opens
      // upward, growing UP so the add-task command line below the list never
      // marches off-screen as it grows past ~5 tasks — review fix I1; see
      // anchor.ts's PanelPlacement doc).
      style={{
        position: 'fixed',
        left: anchor.left,
        ...('top' in anchor ? { top: anchor.top } : { bottom: anchor.bottom }),
      }}
      className={`${overflowOpen ? 'z-50 overflow-visible' : 'z-30 overflow-hidden'} flex max-h-[calc(100dvh-1rem)] w-[min(24rem,calc(100vw-1rem))] flex-col rounded-panel border border-panel-border bg-panel-solid text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]`}
    >
      {/* Header — the active list as a bright uppercase eyebrow, the other
          lists as quieter eyebrows that switch on click (em-dash separated),
          then a "+ list" affordance; on the right the derived progress ring,
          the overflow "⋯", and the close ×. */}
      <div className="flex items-center gap-2 border-b border-hairline px-3.5 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {lists.length === 0 && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              Tasks
            </span>
          )}
          {/* ALL list names render from ONE keyed `.map` — the active one
              differs only in className + aria-current, NEVER in DOM slot. This
              is load-bearing for the focus trap: a two-slot render (active in a
              ternary, the rest in a separate `.map`) remounts the newly-active
              button the instant activeId settles (~1 frame after every open) or
              is switched, so `document.activeElement` ejects to <body> and the
              trap dies (the CRITICAL reviewer repro). One keyed map keeps each
              button's identity, so focus rides through the restyle untouched.
              The em-dash separates consecutive eyebrows, matching the render. */}
          {lists.map((list, i) => {
            const isActive = list.id === activeId
            return (
              <Fragment key={list.id}>
                {i > 0 && (
                  <span aria-hidden className="shrink-0 text-fg-muted/40">
                    —
                  </span>
                )}
                <button
                  type="button"
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => setActiveId(list.id)}
                  className={`min-w-0 truncate text-[11px] uppercase tracking-[0.08em] transition-colors focus-visible:outline-2 focus-visible:outline-accent max-[420px]:min-h-9 motion-reduce:transition-none ${
                    isActive ? 'font-semibold text-fg' : 'font-medium text-fg-muted hover:text-fg'
                  }`}
                >
                  {list.name}
                </button>
              </Fragment>
            )
          })}
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
                className="w-24 border-b border-control-border bg-transparent text-xs text-fg outline-none transition-colors focus-visible:border-accent max-[420px]:h-9 motion-reduce:transition-none"
              />
            </form>
          ) : (
            <button
              type="button"
              aria-label="New list"
              onClick={() => setAddingList(true)}
              className="shrink-0 whitespace-nowrap text-[11px] font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent max-[420px]:min-h-9 max-[420px]:min-w-9 motion-reduce:transition-none"
            >
              + list
            </button>
          )}
        </div>

        {total > 0 && (
          <span
            role="img"
            aria-label={`${doneCount} of ${total} done`}
            className="flex shrink-0 items-center gap-1.5"
          >
            <ProgressRing done={doneCount} total={total} />
            <span aria-hidden className="text-xs tabular-nums text-fg-muted">
              {doneCount}/{total}
            </span>
          </span>
        )}

        {activeList && (
          <OverflowMenu
            hasDone={doneCount > 0}
            owner={panelRef.current!}
            onOpenChange={setOverflowOpen}
            onClearDone={() => dispatch({ type: 'clearDone', listId: activeList.id })}
            onDeleteList={() => dispatch({ type: 'removeList', listId: activeList.id })}
          />
        )}

        <button
          type="button"
          aria-label="Close tasks"
          onClick={onClose}
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent max-[420px]:size-9 motion-reduce:transition-none"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5">
        {!activeList && (
          <p className="px-3.5 py-8 text-center text-sm text-fg-muted">
            No lists yet — create one above.
          </p>
        )}
        {activeList && activeList.items.length === 0 && (
          <p className="px-3.5 py-8 text-center text-sm text-fg-muted">
            Nothing yet — add your first task below.
          </p>
        )}
        {activeList && activeList.items.length > 0 && (
          <ul className="flex flex-col">
            {activeList.items.map((item, index) => (
              <li
                key={item.id}
                className="group relative flex h-8 items-center gap-2.5 pl-3.5 pr-2 transition-colors hover:bg-control-bg max-[420px]:h-auto max-[420px]:min-h-9 motion-reduce:transition-none"
              >
                {/* 2px leading accent bar — lights on hover AND focus-within. */}
                <span
                  aria-hidden
                  className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
                />
                {/* Decorative mono line number (01-06); aria-hidden — it is not
                    a jump target, just a visual signature of the density. */}
                <span
                  aria-hidden
                  className="w-4 shrink-0 text-right font-mono text-[10px] leading-none tabular-nums text-fg-muted/50"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                {/* Round check — the completion-checkmark control family (also on
                    FocusLine): a 20px circle with a fg-derived hairline that
                    fills with accent + a near-black glyph when done. The real
                    <input type=checkbox> stays underneath (sr-only) so keyboard
                    activation, the alt+arrow reorder, focus and <label htmlFor>
                    association are all still the platform's, not hand-rolled;
                    the styled span is a `peer` sibling that reflects its state. */}
                <label className="relative inline-flex shrink-0 cursor-pointer items-center justify-center max-[420px]:size-9">
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
                  className={`min-w-0 flex-1 cursor-pointer truncate text-sm transition-colors max-[420px]:inline-flex max-[420px]:min-h-9 max-[420px]:items-center motion-reduce:transition-none ${
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
                  className="shrink-0 cursor-pointer rounded p-0.5 text-fg-muted opacity-0 transition hover:text-fg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent group-focus-within:opacity-100 group-hover:opacity-100 max-[420px]:grid max-[420px]:size-9 max-[420px]:place-items-center motion-reduce:transition-none"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Command line — a single terminal-style prompt: an accent "+", the
          "Add a task…" input, and an ↵ submit affordance styled as a key hint.
          Enter submits (the input lives in this form); the ↵ is also a real
          submit button so a mouse user has a click target. */}
      {activeList && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const data = new FormData(e.currentTarget)
            const text = String(data.get('text') ?? '')
            dispatch({ type: 'addItem', listId: activeList.id, text })
            e.currentTarget.reset()
          }}
          className="flex items-center gap-2 border-t border-hairline px-3.5 py-2.5"
        >
          <span aria-hidden className="shrink-0 text-sm font-medium text-accent">
            +
          </span>
          <label htmlFor="todo-add-item" className="sr-only">
            Add a task
          </label>
          <input
            id="todo-add-item"
            name="text"
            type="text"
            placeholder="Add a task…"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted max-[420px]:min-h-9"
          />
          <button
            type="submit"
            aria-label="Add task"
            className="grid h-5 min-w-6 shrink-0 cursor-pointer place-items-center rounded border border-control-border px-1 text-[11px] leading-none text-fg-muted transition-colors hover:border-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-accent max-[420px]:min-h-9 max-[420px]:min-w-9 motion-reduce:transition-none"
          >
            ↵
          </button>
        </form>
      )}
    </div>,
    document.body,
  )
}
