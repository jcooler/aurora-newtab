import { useEffect, useState } from 'react'
import { isPremium } from '../../lib/premium'
import ResetLayoutDialog from '../../lib/ResetLayoutDialog'
import type { AuroraStorage } from '../../lib/storage/index'
import { emptyLayoutV2 } from '../../lib/layout/v2'
import type { StoredLayout } from '../../lib/layout/canvasTypes'
import { restorePreviousLayout } from '../../lib/layout/canvasAdapter'
import type { LayoutsDocument } from '../../lib/layout/namedLayouts'
import {
  createLayout,
  deleteLayout,
  duplicateLayout,
  renameLayout,
  reorderLayouts,
  saveLayoutsDocument,
  switchActiveLayout,
} from '../../lib/layout/layoutOperations'
import Section from '../Section'
import { row, label, btnQuiet, btnDanger } from './shared'

/** Legacy layout recovery actions. Gated on `isPremium()` and hidden
 *  ENTIRELY (not disabled/greyed) when it's false — the no-placeholder-UI
 *  rule means a free build shows no trace of a feature it can't use, rather
 *  than a dead button.
 *
 *  The Arrange artboard was deleted with the named-layouts rebuild (NL-P2,
 *  spec §3); live on-page editing and layout management arrive with NL-P3.
 *  This section keeps only the pre-existing legacy actions on the stored
 *  `layout` recovery input: the V1/V2 "Reset layout" confirmation and
 *  "Restore previous layout".
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
  open,
  layoutsDocument = null,
}: {
  storage: AuroraStorage
  open: boolean
  layoutsDocument?: LayoutsDocument | null
}) {
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [canRestore, setCanRestore] = useState(false)
  const [isCanvasLayout, setIsCanvasLayout] = useState<boolean | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setRenamingId(null)
      setConfirmDeleteId(null)
    }
  }, [open])

  // Every management action is one pure operation plus one validated write
  // of the layouts key (named-layouts spec 2.1); switching is instant and
  // cannot lose or alter data.
  const commit = (next: LayoutsDocument) => void saveLayoutsDocument(storage, next)

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
      {layoutsDocument ? (
        <div className="mb-4" data-layouts-management="">
          <p className={`${label} mb-1.5`}>Layouts</p>
          <ul className="space-y-1.5">
            {layoutsDocument.layouts.map((layout, index) => (
              <li key={layout.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-control-bg/40 px-2 py-1.5">
                {renamingId === layout.id ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const value = String(new FormData(event.currentTarget).get('name') ?? '').trim()
                      if (value) commit(renameLayout(layoutsDocument, layout.id, value))
                      setRenamingId(null)
                    }}
                  >
                    <input
                      name="name"
                      defaultValue={layout.name}
                      aria-label={`Rename ${layout.name}`}
                      className="w-36 rounded-md border border-control-border bg-control-bg px-2 py-1 text-xs text-fg"
                    />
                    <button type="submit" className={btnQuiet}>Save name</button>
                  </form>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-fg">
                    {layout.name}
                    {layout.id === layoutsDocument.activeLayoutId ? (
                      <span className="text-xs text-fg-muted">(active)</span>
                    ) : null}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  {layout.id !== layoutsDocument.activeLayoutId ? (
                    <button type="button" className={btnQuiet} onClick={() => commit(switchActiveLayout(layoutsDocument, layout.id))}>
                      Switch
                    </button>
                  ) : null}
                  <button type="button" className={btnQuiet} onClick={() => setRenamingId(layout.id)}>
                    Rename
                  </button>
                  <button
                    type="button"
                    className={btnQuiet}
                    onClick={() => commit(duplicateLayout(layoutsDocument, layout.id, {
                      id: crypto.randomUUID(),
                      name: `${layout.name} copy`,
                    }))}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className={btnQuiet}
                    aria-label={`Move ${layout.name} up`}
                    disabled={index === 0}
                    onClick={() => commit(reorderLayouts(layoutsDocument, index, index - 1))}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className={btnQuiet}
                    aria-label={`Move ${layout.name} down`}
                    disabled={index === layoutsDocument.layouts.length - 1}
                    onClick={() => commit(reorderLayouts(layoutsDocument, index, index + 1))}
                  >
                    Down
                  </button>
                  {layoutsDocument.layouts.length > 1 ? (
                    confirmDeleteId === layout.id ? (
                      <button
                        type="button"
                        className={btnDanger}
                        onClick={() => {
                          setConfirmDeleteId(null)
                          commit(deleteLayout(layoutsDocument, layout.id))
                        }}
                      >
                        Confirm delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={btnDanger}
                        aria-label={`Delete ${layout.name}`}
                        onClick={() => setConfirmDeleteId(layout.id)}
                      >
                        Delete
                      </button>
                    )
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`${btnQuiet} mt-2`}
            onClick={() => commit(createLayout(layoutsDocument, {
              id: crypto.randomUUID(),
              name: `Layout ${layoutsDocument.layouts.length + 1}`,
            }))}
          >
            New layout
          </button>
        </div>
      ) : null}
      {isCanvasLayout === false ? (
        <div className={row}>
          <span className={label}>Widget positions</span>
          {/* Legacy-only: a V1/V2 store may still reset its stored layout. */}
          <button type="button" onClick={() => setResetDialogOpen(true)} className={btnDanger}>
            Reset layout
          </button>
        </div>
      ) : null}
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
