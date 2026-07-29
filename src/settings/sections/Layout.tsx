import { useEffect } from 'react'
import { isPremium } from '../../lib/premium'
import { useArmedConfirm } from '../../lib/hooks/useArmedConfirm'
import type { AuroraStorage } from '../../lib/storage/index'
import { row, label } from './shared'

const RESET_CONFIRM_COPY = 'Reset layout? This puts every widget back.'

/** Widget-arrangement entry points. Both gated on `isPremium()` and hidden
 *  ENTIRELY (not disabled/greyed) when it's false — the no-placeholder-UI
 *  rule means a free build shows no trace of a feature it can't use, rather
 *  than a dead button.
 *
 *  "Arrange layout" hands off to `onArrangeLayout` — App composes that as
 *  "close the drawer, then bump ArrangeController's `openSignal` nonce" so
 *  the page is actually visible once arrange mode's overlay appears.
 *
 *  "Reset layout" uses the exact same two-step arm/confirm idiom
 *  (`useArmedConfirm`) as the arrange pill's own Reset layout button inside
 *  `ArrangeController` — the shared piece is the state machine, not this
 *  JSX, since settings and the newtab/arrange feature tree never import
 *  from each other.
 *
 *  `open` (review fix): this section — like the rest of SettingsPanel —
 *  stays MOUNTED while the Drawer is merely closed (Drawer only toggles
 *  `inert`/`translate-x-full` on itself, see Drawer.tsx), so an armed Reset
 *  would otherwise survive a close and ambush a reopen within the arm
 *  window. Disarms the instant the drawer closes rather than waiting for a
 *  reopen, so it's never even MOMENTARILY visible pre-armed. */
export default function Layout({
  storage,
  onArrangeLayout,
  open,
}: {
  storage: AuroraStorage
  onArrangeLayout: () => void
  open: boolean
}) {
  const resetConfirm = useArmedConfirm(() => {
    void storage.set('layout', {})
  })

  useEffect(() => {
    if (!open) resetConfirm.disarm()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only `open` transitions should re-run this; `resetConfirm.disarm` changes identity every render but is otherwise safe to omit
  }, [open])

  if (!isPremium()) return null

  return (
    <section aria-label="Layout">
      <h3 className="mb-1 text-sm font-medium text-fg">Layout</h3>
      <div className={row}>
        <span className={label}>Widget positions</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onArrangeLayout}
            className="rounded border border-panel-border px-2 py-1 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            Arrange layout
          </button>
          <button
            type="button"
            onClick={resetConfirm.trigger}
            className="rounded border border-panel-border px-2 py-1 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            {resetConfirm.armed ? RESET_CONFIRM_COPY : 'Reset layout'}
          </button>
        </div>
      </div>
    </section>
  )
}
