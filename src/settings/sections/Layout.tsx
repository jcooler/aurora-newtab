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
 *  from each other. */
export default function Layout({
  storage,
  onArrangeLayout,
}: {
  storage: AuroraStorage
  onArrangeLayout: () => void
}) {
  const resetConfirm = useArmedConfirm(() => {
    void storage.set('layout', {})
  })

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
