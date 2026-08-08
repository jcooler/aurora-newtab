import { useEffect, useState } from 'react'
import { isPremium } from '../../lib/premium'
import ResetLayoutDialog from '../../lib/ResetLayoutDialog'
import type { AuroraStorage } from '../../lib/storage/index'
import Section from '../Section'
import { row, label, btnQuiet, btnDanger } from './shared'

/** Widget-arrangement entry points. Both gated on `isPremium()` and hidden
 *  ENTIRELY (not disabled/greyed) when it's false — the no-placeholder-UI
 *  rule means a free build shows no trace of a feature it can't use, rather
 *  than a dead button.
 *
 *  "Arrange layout" hands off to `onArrangeLayout` — App composes that as
 *  "close the drawer, then bump ArrangeController's `openSignal` nonce" so
 *  the page is actually visible once arrange mode's overlay appears.
 *
 *  "Reset layout" opens the exact same shared confirm dialog
 *  (`src/lib/ResetLayoutDialog.tsx`) as the arrange pill's own danger-styled
 *  Reset button inside `ArrangeController` — replacing the old two-step
 *  arm/auto-expire idiom (`useArmedConfirm`, since removed from both call
 *  sites) per explicit user feedback that a silently-auto-reverting button
 *  is a bad pattern for a destructive action. Settings and the newtab/arrange
 *  feature tree still never import from each other directly; the dialog
 *  lives in `lib`, shared by both.
 *
 *  `open` (review fix): this section — like the rest of SettingsPanel —
 *  stays MOUNTED while the Drawer is merely closed (Drawer only toggles
 *  `inert`/`translate-x-full` on itself, see Drawer.tsx), so a confirm
 *  dialog left open would otherwise survive a close and ambush a reopen.
 *  Closes the dialog the instant the drawer closes rather than waiting for a
 *  reopen, so it's never even momentarily visible pre-opened. `inert` on the
 *  drawer's own panel (see Drawer.tsx) already makes a still-open dialog
 *  behind it unreachable the moment the drawer closes — this just also
 *  drops its state so a reopen doesn't resurrect it. */
export default function Layout({
  storage,
  onArrangeLayout,
  open,
}: {
  storage: AuroraStorage
  onArrangeLayout: () => void
  open: boolean
}) {
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  useEffect(() => {
    if (!open) setResetDialogOpen(false)
  }, [open])

  if (!isPremium()) return null

  return (
    <Section title="Layout">
      <div className={row}>
        <span className={label}>Widget positions</span>
        <div className="flex gap-2">
          <button type="button" onClick={onArrangeLayout} className={btnQuiet}>
            Arrange layout
          </button>
          {/* Danger-styled to match the arrange pill's own Reset button —
              same restrained-red convention (ResetLayoutDialog's doc
              comment), since this opens the identical destructive dialog. */}
          <button type="button" onClick={() => setResetDialogOpen(true)} className={btnDanger}>
            Reset layout
          </button>
        </div>
      </div>

      <ResetLayoutDialog
        open={resetDialogOpen}
        onCancel={() => setResetDialogOpen(false)}
        onConfirm={() => {
          setResetDialogOpen(false)
          void storage.set('layout', {})
        }}
      />
    </Section>
  )
}
