import { useEffect, useRef } from 'react'

// Shared newest-first Escape stack for every top-level dialog/panel (Drawer,
// TodoPanel, TimerWidget's panel, Palette). A single document-level keydown
// listener is installed lazily on the first registration and torn down once
// the stack empties, so there's exactly one `keydown` subscriber no matter
// how many dialogs exist across the app — Escape always closes whichever one
// registered most recently, and each press pops exactly one.
export type DialogCloseResult = void | boolean | Promise<boolean>

interface StackEntry {
  onClose: () => DialogCloseResult
}

const stack: StackEntry[] = []
let attached = false
let closeAllPromise: Promise<boolean> | null = null

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const top = stack[stack.length - 1]
  if (!top) return
  e.preventDefault()
  try {
    void Promise.resolve(top.onClose()).catch(() => false)
  } catch {
    // A rejected close intentionally leaves the entry registered for retry.
  }
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
 * one call. Built for full-page mode entries (the retired Arrange overlay
 * used it; NL-P3's live edit session is the next owner): such an overlay
 * makes the rest of the page `inert`, so nothing open underneath it could be
 * closed by the user anymore anyway; this guarantees mode entry itself never
 * leaves a stale open panel (Notes/Todo/Timer/Drawer/Palette/...) stranded
 * there.
 *
 * Each close is awaited before its entry is removed and the next-oldest one
 * begins. A false result or rejection means the dialog stayed open, so the
 * entry remains on top and the transaction stops. Concurrent callers share
 * one transaction, preventing a slow persistence-backed close from running
 * twice.
 */
export function closeAllDialogs(): Promise<boolean> {
  if (closeAllPromise) return closeAllPromise

  const operation = (async () => {
    while (stack.length > 0) {
      const entry = stack[stack.length - 1]
      let result: void | boolean
      try {
        result = await entry.onClose()
      } catch {
        return false
      }
      if (result === false) return false

      const index = stack.indexOf(entry)
      if (index !== -1) stack.splice(index, 1)
      if (stack.length === 0) detach()
    }
    return true
  })()

  closeAllPromise = operation.finally(() => {
    closeAllPromise = null
  })
  return closeAllPromise
}

export function hasOpenDialogs(): boolean {
  return stack.length > 0
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
export function useDialogEscape(onClose: () => DialogCloseResult, active = true): void {
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
