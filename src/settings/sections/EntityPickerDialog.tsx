import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialogEscape } from '../../lib/dialogStack'
import { useFocusTrap } from '../../lib/hooks/useFocusTrap'
import { fuzzyScore } from '../../lib/fuzzy'
import {
  ACTION_DOMAINS,
  MAX_ACTIONS,
  MAX_CHIP_ENTITIES,
  type HaAction,
  type HaEntityRef,
  type HaState,
} from '../../services/connectors/homeassistant'
import { btnPrimary, btnQuiet, eyebrow } from './shared'

const ACTION_DOMAIN_SET: ReadonlySet<string> = new Set(ACTION_DOMAINS)

/** The Home Assistant connector's entity picker (Task 100, W3-SP5) — a
 *  portaled, searchable, domain-grouped checklist with two independent hard
 *  caps: MAX_CHIP_ENTITIES on the "Show" pick (the widget's chip row) and
 *  MAX_ACTIONS on the "Action" pick (the three-button row, offered only for
 *  ACTION_DOMAINS rows). PURE presentational: props in, `onSave(entities,
 *  actions)` out — no network, no storage. The card (Task 101) owns fetching
 *  `states` and persisting whatever `onSave` hands back.
 *
 *  Structural skeleton copied verbatim from ResetLayoutDialog.tsx: portal to
 *  document.body (an ancestor's CSS transform — the Settings Drawer's own
 *  sliding panel — becomes the containing block for `position: fixed`
 *  descendants otherwise, silently shrinking a viewport-centered overlay
 *  down to that ancestor's box), sibling backdrop + pointer-events-none
 *  positioning wrapper (role="dialog" nested inside an aria-hidden ancestor
 *  makes Chrome log an aria-hidden-retained-focus warning the instant the
 *  focus trap moves focus in), z-[70] (above the arrange overlay's z-[60],
 *  harmless overkill above the Drawer/Palette's z-50), and the same panel
 *  class string.
 *
 *  DIFFERS from ResetLayoutDialog on first-focusable order: that dialog
 *  puts Cancel first in DOM so the trap's default "focus the first
 *  focusable" lands on the safe, non-destructive option. Here the safe
 *  default IS typing — the search input renders first, Cancel and Save sit
 *  at the bottom (Cancel before Save), and useFocusTrap's unmodified
 *  first-focusable behavior lands on the search box for free.
 *
 *  Selection state is local (two id Sets) and reseeded from `entities`/
 *  `actions` only on the false->true `open` transition (dep array is just
 *  `[open]`, deliberately excluding `entities`/`actions` — a parent
 *  re-render with a fresh-identity-but-same-content array must never
 *  clobber picks the user is mid-editing while the dialog stays open).
 *
 *  Caps are enforced by DISABLING every unchecked box of that kind once its
 *  cap is reached (an already-checked box stays enabled, so unchecking to
 *  free a slot always works) — never a silent drop — with a persistent
 *  "N of MAX chips · N of MAX actions" count line so the limit is always
 *  visible, not just at the moment it bites.
 *
 *  Save reads each picked id back through `states` (the friendly_name
 *  showing THIS render, i.e. "captured at pick time" per HaEntityRef's own
 *  doc comment — a rename in HA doesn't retroactively relabel an
 *  already-picked chip). An id that's still picked but has since dropped out
 *  of the current `states` poll (deleted/renamed/instance unreachable) falls
 *  back to whatever ref/action was already in the incoming props, so a
 *  transient empty/partial poll while re-opening the dialog to edit an
 *  existing pick can never silently erase it.
 *
 *  `states` (and, symmetrically, `actions`) can change PROP VALUE while the
 *  dialog stays open — a live re-poll landing mid-session, same instance,
 *  `open` never toggling — so a freshly-toggled action's entity can vanish
 *  from `states` before Save fires, with no seeded prop entry to fall back
 *  to either (review fix, round 1: this used to hardcode `domain: 'switch'`
 *  in that gap, which is simply WRONG for a vanished scene/script — it would
 *  later fire `switch.toggle` against a scene/script entity). HA entity ids
 *  are always `domain.object_id` (the same derivation homeassistant.ts's
 *  unexported `domainOf` uses), so the id itself still names its true domain
 *  even once the row is gone — that prefix is the fallback now, VALIDATED
 *  against ACTION_DOMAINS before use. An id whose own prefix isn't an
 *  eligible action domain has no honest domain left to save it under, so
 *  it's DROPPED from `outActions` rather than fabricated — the same
 *  skip-don't-crash floor `haActionsOf` (homeassistant.ts) applies to a
 *  malformed stored entry. */
export default function EntityPickerDialog({
  open,
  states,
  entities,
  actions,
  onCancel,
  onSave,
}: {
  open: boolean
  states: HaState[]
  entities: HaEntityRef[]
  actions: HaAction[]
  onCancel: () => void
  onSave: (entities: HaEntityRef[], actions: HaAction[]) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const idPrefix = useId()
  const dialogHeadingId = `${idPrefix}-heading`
  const instructionsId = `${idPrefix}-instructions`
  const countId = `${idPrefix}-count`
  const showHeadingId = `${idPrefix}-show`
  const actionHeadingId = `${idPrefix}-action`
  const [query, setQuery] = useState('')
  const [pickedEntityIds, setPickedEntityIds] = useState<Set<string>>(() => new Set())
  const [pickedActionIds, setPickedActionIds] = useState<Set<string>>(() => new Set())

  useFocusTrap(dialogRef, open)
  useDialogEscape(onCancel, open)

  // Reseed on every false->true (or already-true-at-mount) transition only —
  // see the doc comment above for why entities/actions themselves aren't in
  // this dep array.
  useEffect(() => {
    if (!open) return
    setPickedEntityIds(new Set(entities.map((e) => e.id)))
    setPickedActionIds(new Set(actions.map((a) => a.id)))
    setQuery('')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed only on the open transition, not on every parent re-render
  }, [open])

  // Fuzzy-ranked over `${friendlyName} ${id}`, house idiom
  // (sort by score desc, then original index — fuzzy.ts callers elsewhere
  // follow the same tie-break). An empty query scores every row 0 via
  // fuzzyScore's own empty-needle short-circuit, so this doubles as the
  // "no query" path: everything matches, original order preserved by the
  // index tie-break, then grouped below.
  const groups = useMemo(() => {
    const ranked = states
      .map((s, i) => ({ s, i, score: fuzzyScore(query, `${s.friendlyName} ${s.id}`) }))
      .filter((x): x is { s: HaState; i: number; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((x) => x.s)

    const byDomain = new Map<string, HaState[]>()
    for (const s of ranked) {
      const list = byDomain.get(s.domain)
      if (list) list.push(s)
      else byDomain.set(s.domain, [s])
    }
    return Array.from(byDomain.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [states, query])

  if (!open) return null

  function toggleEntity(id: string) {
    setPickedEntityIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_CHIP_ENTITIES) next.add(id)
      return next
    })
  }

  function toggleAction(id: string) {
    setPickedActionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_ACTIONS) next.add(id)
      return next
    })
  }

  function handleSave() {
    const byId = new Map(states.map((s) => [s.id, s]))
    const outEntities: HaEntityRef[] = Array.from(pickedEntityIds).map((id) => {
      const s = byId.get(id)
      if (s) return { id, name: s.friendlyName }
      return entities.find((e) => e.id === id) ?? { id, name: id }
    })
    const outActions: HaAction[] = Array.from(pickedActionIds).flatMap((id): HaAction[] => {
      const s = byId.get(id)
      if (s && ACTION_DOMAIN_SET.has(s.domain)) {
        return [{ id, name: s.friendlyName, domain: s.domain as HaAction['domain'] }]
      }
      const seeded = actions.find((a) => a.id === id)
      if (seeded) return [seeded]
      // Neither in the live poll nor in the original seed — derive the
      // domain from the id's own prefix rather than guessing (see this
      // file's header comment). Only trust that derived prefix when it's
      // itself an eligible action domain; otherwise there's nothing honest
      // left to save, so the pick is dropped.
      const domain = id.split('.')[0] ?? id
      if (!ACTION_DOMAIN_SET.has(domain)) return []
      return [{ id, name: id, domain: domain as HaAction['domain'] }]
    })
    onSave(outEntities, outActions)
  }

  return createPortal(
    <>
      <div aria-hidden onClick={onCancel} className="fixed inset-0 z-[70] bg-black/30" />
      <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogHeadingId}
          aria-describedby={`${instructionsId} ${countId}`}
          className="pointer-events-auto flex w-full max-w-md flex-col rounded-panel border border-panel-border bg-panel-solid p-5 text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]"
        >
          <h2 id={dialogHeadingId} className="text-base font-medium text-fg">
            Pick entities
          </h2>
          <p id={instructionsId} className="mt-1 text-xs text-fg-muted">
            Choose which entities appear as status chips or actions.
          </p>
          <input
            type="search"
            aria-label="Search entities"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entities…"
            className="mt-3 h-9 rounded-lg border border-control-border bg-control-bg px-2.5 text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent"
          />

          <div className="mt-3 grid grid-cols-[2.25rem_2.25rem_minmax(0,1fr)] items-center gap-3 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">
            <span id={showHeadingId} className="text-center">Show</span>
            <span id={actionHeadingId} className="text-center">Action</span>
            <span>Entity</span>
          </div>

          <div className="mt-1 max-h-96 overflow-y-auto">
            {groups.length === 0 ? (
              <p className="py-3 text-sm text-fg-muted">No matches</p>
            ) : (
              groups.map(([domain, list]) => {
                const domainHeadingId = `${idPrefix}-domain-${domain}`
                return (
                <section key={domain} role="group" aria-labelledby={domainHeadingId} className="mb-3 last:mb-0">
                  <h3 id={domainHeadingId} className={eyebrow}>{domain.charAt(0).toUpperCase() + domain.slice(1)}</h3>
                  {list.map((s) => {
                    const isActionDomain = ACTION_DOMAIN_SET.has(s.domain)
                    const entityChecked = pickedEntityIds.has(s.id)
                    const entityDisabled = !entityChecked && pickedEntityIds.size >= MAX_CHIP_ENTITIES
                    const actionChecked = pickedActionIds.has(s.id)
                    const actionDisabled = !actionChecked && pickedActionIds.size >= MAX_ACTIONS
                    const rowLabelId = `${idPrefix}-entity-${s.id}`

                    return (
                      <div key={s.id} className="grid grid-cols-[2.25rem_2.25rem_minmax(0,1fr)] items-center gap-3 py-1 text-sm">
                        <label className="flex min-h-9 min-w-9 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            aria-labelledby={`${showHeadingId} ${rowLabelId}`}
                            checked={entityChecked}
                            disabled={entityDisabled}
                            onChange={() => toggleEntity(s.id)}
                          />
                        </label>
                        {isActionDomain && (
                          <label className="flex min-h-9 min-w-9 cursor-pointer items-center justify-center">
                            <input
                              type="checkbox"
                              aria-labelledby={`${actionHeadingId} ${rowLabelId}`}
                              checked={actionChecked}
                              disabled={actionDisabled}
                              onChange={() => toggleAction(s.id)}
                            />
                          </label>
                        )}
                        {!isActionDomain && <span aria-hidden />}
                        <span id={rowLabelId} className="truncate">
                          {s.friendlyName} <span className="text-fg-muted">{s.id}</span>
                        </span>
                      </div>
                    )
                  })}
                </section>
                )
              })
            )}
          </div>

          <p id={countId} className="mt-3 text-xs text-fg-muted">
            {pickedEntityIds.size} of {MAX_CHIP_ENTITIES} chips · {pickedActionIds.size} of {MAX_ACTIONS} actions
          </p>

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className={`${btnQuiet} min-h-9 min-w-9 justify-center`}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} className={`${btnPrimary} min-h-9 min-w-9 justify-center`}>
              Save
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
