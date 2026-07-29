import { useEffect, useRef } from 'react'

// Shared newest-first Escape stack for every top-level dialog/panel (Drawer,
// TodoPanel, TimerWidget's panel, Palette). A single document-level keydown
// listener is installed lazily on the first registration and torn down once
// the stack empties, so there's exactly one `keydown` subscriber no matter
// how many dialogs exist across the app — Escape always closes whichever one
// registered most recently, and each press pops exactly one.
interface StackEntry {
  onClose: () => void
}

const stack: StackEntry[] = []
let attached = false

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const top = stack[stack.length - 1]
  if (!top) return
  e.preventDefault()
  top.onClose()
}

function attach() {
  if (attached) return
  document.addEventListener('keydown', onKeyDown)
  attached = true
}

function detach() {
  if (!attached) return
  document.removeEventListener('keydown', onKeyDown)
  attached = false
}

/**
 * Closes every currently-registered dialog, newest-first — the same order
 * Escape pops them in, one press at a time, except this fires all of them in
 * one call. Used when arrange mode engages (ArrangeController): the overlay
 * makes the rest of the page `inert`, so nothing open underneath it could be
 * closed by the user anymore anyway; this guarantees mode entry itself never
 * leaves a stale open panel (Notes/Todo/Timer/Drawer/Palette/...) stranded
 * there.
 *
 * The stack is snapshotted and cleared FIRST, before any `onClose` runs:
 * `onClose` handlers are typically a React `setState`, so the dialog's own
 * `useDialogEscape` cleanup effect (which would otherwise splice its entry
 * back out of `stack`) doesn't actually run until a later commit — clearing
 * up front means (a) that later no-op splice is safe (its entry is already
 * gone) and (b) anything registered fresh afterward (e.g. ArrangeController's
 * own `useDialogEscape(exit, mode === 'on')`, once `mode` flips) starts from
 * a genuinely empty stack, becoming the new top naturally. Only entries that
 * were actually active (registered) at call time are ever invoked — an entry
 * that already unregistered itself (closed by other means) is simply gone
 * from `stack` and is silently skipped, same as `onKeyDown` above would.
 */
export function closeAllDialogs(): void {
  const active = stack.slice().reverse()
  stack.length = 0
  detach()
  for (const entry of active) entry.onClose()
}

/**
 * Registers `onClose` as the "topmost" dialog while `active` is true. Escape
 * (unless already `defaultPrevented` by some inner consumer) closes only the
 * most-recently-registered active entry, so stacking dialogs (e.g. Tasks
 * panel then Timer panel) close newest-first, one per press.
 *
 * `onClose` is read through a ref so an unstable inline callback identity
 * (e.g. `() => setOpen(false)` re-created on every parent render) never
 * re-registers the entry — only `active` flipping mounts/unmounts it, which
 * is what should determine stack position.
 */
export function useDialogEscape(onClose: () => void, active = true): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!active) return
    const entry: StackEntry = { onClose: () => onCloseRef.current() }
    stack.push(entry)
    attach()
    return () => {
      const index = stack.indexOf(entry)
      if (index !== -1) stack.splice(index, 1)
      if (stack.length === 0) detach()
    }
  }, [active])
}
