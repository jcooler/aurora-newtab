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
