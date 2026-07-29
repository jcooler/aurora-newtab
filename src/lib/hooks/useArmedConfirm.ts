import { useEffect, useRef, useState } from 'react'

const DEFAULT_ARM_MS = 4000

/** The two-step "arm, then confirm" inline click idiom used by every
 *  destructive one-click-away control in Aurora that doesn't warrant a full
 *  Confirm/Cancel pair (see `src/settings/sections/Data.tsx`'s import
 *  confirm for that heavier pattern, used when there's real content to
 *  summarize first). The first call to `trigger()` only arms — flips
 *  `armed` true so the caller can swap its button's own label to a confirm
 *  prompt — a second call while still armed runs `onConfirm` and disarms.
 *  Arming auto-expires after `armMs` so a stray later click (the user
 *  walked away, came back, and clicked the button again for an unrelated
 *  reason) can never land as an accidental confirm.
 *
 *  Deliberately just the state machine, not any JSX: this is shared
 *  verbatim between the arrange-mode pill's "Reset layout" button
 *  (`src/newtab/arrange/ArrangeController.tsx`) and the Settings "Layout"
 *  section's own copy of the same control (`src/settings/sections/
 *  Layout.tsx`) — two feature trees that otherwise never import from each
 *  other — without either one owning the other's button markup/styling. */
export function useArmedConfirm(onConfirm: () => void, armMs = DEFAULT_ARM_MS) {
  const [armed, setArmed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read through a ref so an unstable inline `onConfirm` identity (common —
  // callers typically pass a fresh closure every render) never changes
  // `trigger`'s own identity or misses the latest closure's captured values.
  const onConfirmRef = useRef(onConfirm)
  onConfirmRef.current = onConfirm

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  function trigger() {
    if (!armed) {
      setArmed(true)
      timerRef.current = setTimeout(() => setArmed(false), armMs)
      return
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setArmed(false)
    onConfirmRef.current()
  }

  return { armed, trigger }
}
