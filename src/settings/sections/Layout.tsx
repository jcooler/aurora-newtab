import { useEffect, useState } from 'react'
import { isPremium } from '../../lib/premium'
import ResetLayoutDialog from '../../lib/ResetLayoutDialog'
import type { AuroraStorage } from '../../lib/storage/index'
import { emptyLayoutV2 } from '../../lib/layout/v2'
import type { StoredLayout } from '../../lib/layout/canvasTypes'
import { restorePreviousLayout } from '../../lib/layout/canvasAdapter'
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
 *  The legacy V1/V2 "Reset layout" action keeps its shared confirmation
 *  dialog. Canvas V3 hides that global action because it cannot preserve
 *  independent profiles or recovery; profile reset belongs to Canvas Save.
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
  const [canRestore, setCanRestore] = useState(false)
  const [isCanvasLayout, setIsCanvasLayout] = useState<boolean | null>(null)

  useEffect(() => {
    if (!open) setResetDialogOpen(false)
  }, [open])

  useEffect(() => {
    let live = true
    let gotUpdate = false
    const updateAvailability = (layout: StoredLayout) => {
      const canvas = 'version' in layout && layout.version === 3
      setIsCanvasLayout(canvas)
      if (canvas) setResetDialogOpen(false)
      setCanRestore(
        canvas
        && Boolean(layout.recovery?.semanticV2 || layout.recovery?.legacyV1),
      )
    }
    const unsubscribe = storage.subscribe('layout', (layout) => {
      gotUpdate = true
      updateAvailability(layout)
    })
    void storage.get('layout').then((layout) => {
      if (live && !gotUpdate) updateAvailability(layout)
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [storage])

  if (!isPremium()) return null

  return (
    <Section title="Layout">
      <div className={row}>
        <span className={label}>Widget positions</span>
        <div className="flex gap-2">
          <button type="button" onClick={onArrangeLayout} className={btnQuiet}>
            Arrange layout
          </button>
          {/* Legacy-only: Canvas V3 reset is profile-scoped inside its editor. */}
          {isCanvasLayout === false ? (
            <button type="button" onClick={() => setResetDialogOpen(true)} className={btnDanger}>
              Reset layout
            </button>
          ) : null}
        </div>
      </div>
      {canRestore ? (
        <div className={row}>
          <span className={label}>Previous layout</span>
          <button
            type="button"
            className={btnQuiet}
            onClick={() => {
              void storage.update('layout', (layout) => restorePreviousLayout(layout) ?? layout)
            }}
          >
            Restore previous layout
          </button>
        </div>
      ) : null}

      <ResetLayoutDialog
        open={resetDialogOpen && isCanvasLayout === false}
        onCancel={() => setResetDialogOpen(false)}
        onConfirm={() => {
          setResetDialogOpen(false)
          void storage.set('layout', emptyLayoutV2())
        }}
      />
    </Section>
  )
}
