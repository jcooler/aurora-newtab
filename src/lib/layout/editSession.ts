import {
  cleanLayoutsDocument,
  dockedXPercent,
  freePlacementFromPoint,
  pointFromFreePlacement,
  type DockEdge,
  type FreeWidgetPlacement,
  type LayoutsDocument,
  type NamedLayoutPlacement,
  type NamedLayout,
  type WidgetStack,
  type WidgetTier,
} from './namedLayouts'
import { defaultFreePlacement } from './defaultPlacements'
import {
  createOrAppendStack,
  detachStackMember,
  hideStack,
  removeStackMember,
  reorderStackMember,
  setStackFacing,
  type StackDropTarget,
} from './stacks'
import { BLOCK_IDS, type BlockId } from './types'

export type EditSelection =
  | Readonly<{ kind: 'widget'; id: BlockId }>
  | Readonly<{ kind: 'stack'; id: string }>

/** The live edit session's draft model (named-layouts spec 2.5). Pure: every
 *  operation returns a new session; the ONLY storage write in the whole
 *  feature is `saveLayoutsDocument(storage, session.draft)` on explicit
 *  Save. Cancel simply discards the session — exact by construction, since
 *  nothing was ever written.
 *
 *  `baseline` is the initial MATERIALIZED draft: enabled-but-absent widgets
 *  are placed into it at their designed default slots on entry, so what the
 *  user sees, edits, resets to, and saves are the same stored values (the
 *  NL-P2 review's layer guidance: persist from the draft, never from derived
 *  render output). */
export interface EditSession {
  baseline: LayoutsDocument
  draft: LayoutsDocument
  selection: EditSelection | null
  /** Compatibility bridge for the pre-stack canvas. Removed when Task 4
   *  moves every UI consumer to the tagged selection. */
  selectedId: BlockId | null
  past: readonly LayoutsDocument[]
  dirty: boolean
}

const UNDO_CAP = 50

/** cleanLayoutsDocument iterates widgets in BLOCK_IDS order and rebuilds
 *  every object, so stringify equality over cleaned documents is a sound
 *  structural comparison here. */
function documentsEqual(left: LayoutsDocument, right: LayoutsDocument): boolean {
  return JSON.stringify(cleanLayoutsDocument(left)) === JSON.stringify(cleanLayoutsDocument(right))
}

function activeIndex(document: LayoutsDocument): number {
  const index = document.layouts.findIndex((layout) => layout.id === document.activeLayoutId)
  return index === -1 ? 0 : index
}

export function activeDraftLayout(session: EditSession): NamedLayout {
  return session.draft.layouts[activeIndex(session.draft)]
}

function withActiveLayout(
  document: LayoutsDocument,
  update: (layout: NamedLayout) => NamedLayout,
): LayoutsDocument {
  const index = activeIndex(document)
  const layouts = document.layouts.map((layout, i) => (i === index ? update(layout) : layout))
  return { ...document, layouts }
}

export function beginEditSession(
  document: LayoutsDocument,
  enabledIds: readonly BlockId[],
): EditSession {
  const enabled = new Set<BlockId>(enabledIds)
  const materialized = withActiveLayout(cleanLayoutsDocument(document), (layout) => {
    const widgets = { ...layout.widgets }
    const stacked = new Set(layout.stacks?.flatMap((stack) => stack.members) ?? [])
    let maxLayer = -1
    for (const id of BLOCK_IDS) {
      const placement = widgets[id]
      if (placement?.kind === 'free') maxLayer = Math.max(maxLayer, placement.layer)
    }
    for (const stack of layout.stacks ?? []) maxLayer = Math.max(maxLayer, stack.layer)
    for (const id of BLOCK_IDS) {
      if (!enabled.has(id) || widgets[id] || stacked.has(id)) continue
      widgets[id] = defaultFreePlacement(id, maxLayer + 1 + BLOCK_IDS.indexOf(id))
    }
    return { ...layout, widgets }
  })
  return {
    baseline: materialized,
    draft: materialized,
    selection: null,
    selectedId: null,
    past: [],
    dirty: false,
  }
}

function commit(session: EditSession, draft: LayoutsDocument, pushUndo = true): EditSession {
  const cleaned = cleanLayoutsDocument(draft)
  return {
    ...session,
    draft: cleaned,
    past: pushUndo ? [...session.past.slice(-(UNDO_CAP - 1)), session.draft] : session.past,
    dirty: !documentsEqual(cleaned, session.baseline),
  }
}

function commitActiveLayoutUpdate(
  session: EditSession,
  update: (layout: NamedLayout) => NamedLayout,
  pushUndo = true,
): EditSession {
  const current = activeDraftLayout(session)
  const next = update(current)
  if (next === current) return session
  return commit(session, withActiveLayout(session.draft, () => next), pushUndo)
}

export function selectWidget(session: EditSession, id: BlockId | null): EditSession {
  return {
    ...session,
    selection: id ? { kind: 'widget', id } : null,
    selectedId: id,
  }
}

export function selectStack(session: EditSession, id: string): EditSession {
  if (!activeDraftLayout(session).stacks?.some((stack) => stack.id === id)) return session
  return { ...session, selection: { kind: 'stack', id }, selectedId: null }
}

function stackAsFreePlacement(stack: WidgetStack): FreeWidgetPlacement {
  return {
    kind: 'free',
    anchor: stack.anchor,
    offsetX: stack.offsetX,
    offsetY: stack.offsetY,
    tier: stack.tier,
    layer: stack.layer,
  }
}

function selectedFree(session: EditSession): FreeWidgetPlacement | null {
  const selection = session.selection
  if (!selection) return null
  const layout = activeDraftLayout(session)
  if (selection.kind === 'stack') {
    const stack = layout.stacks?.find((candidate) => candidate.id === selection.id)
    return stack ? stackAsFreePlacement(stack) : null
  }
  const placement = layout.widgets[selection.id]
  return placement?.kind === 'free' ? placement : null
}

function replaceSelected(
  session: EditSession,
  placement: NamedLayoutPlacement,
  pushUndo = true,
): EditSession {
  const selection = session.selection
  if (!selection) return session
  if (selection.kind === 'stack') {
    if (placement.kind !== 'free') return session
    return commit(session, withActiveLayout(session.draft, (layout) => ({
      ...layout,
      stacks: layout.stacks?.map((stack) => stack.id === selection.id ? {
        ...stack,
        anchor: placement.anchor,
        offsetX: placement.offsetX,
        offsetY: placement.offsetY,
        tier: placement.tier,
        layer: placement.layer,
      } : stack),
    })), pushUndo)
  }
  return commit(session, withActiveLayout(session.draft, (layout) => ({
    ...layout,
    widgets: { ...layout.widgets, [selection.id]: placement },
  })), pushUndo)
}

function movedPlacement(
  current: FreeWidgetPlacement,
  point: { xPct: number; yPct: number },
): FreeWidgetPlacement {
  return freePlacementFromPoint({
    x: point.xPct,
    y: point.yPct,
    tier: current.tier,
    layer: current.layer,
  })
}

export function moveSelected(
  session: EditSession,
  point: { xPct: number; yPct: number },
): EditSession {
  const current = selectedFree(session)
  if (!current) return session
  return replaceSelected(session, movedPlacement(current, point))
}

/** Same re-anchoring as moveSelected but WITHOUT a new undo entry — a drag
 *  pushes one entry on its first move and streams the rest through this. */
export function moveSelectedLive(
  session: EditSession,
  point: { xPct: number; yPct: number },
): EditSession {
  const current = selectedFree(session)
  if (!current) return session
  return replaceSelected(session, movedPlacement(current, point), false)
}

export function nudgeSelected(
  session: EditSession,
  delta: { xPct: number; yPct: number },
): EditSession {
  const current = selectedFree(session)
  if (!current) return session
  const point = pointFromFreePlacement(current)
  return moveSelected(session, { xPct: point.x + delta.xPct, yPct: point.y + delta.yPct })
}

export function setSelectedTier(session: EditSession, tier: WidgetTier): EditSession {
  const selection = session.selection
  if (!selection) return session
  const placement = selection.kind === 'widget'
    ? activeDraftLayout(session).widgets[selection.id]
    : undefined
  // Docked members size within the strip too (owner direction 2026-08-18:
  // docked Bookmarks compact = the one-letter mark bar).
  if (placement?.kind === 'docked') {
    return replaceSelected(session, { ...placement, tier })
  }
  const current = selectedFree(session)
  if (!current) return session
  return replaceSelected(session, { ...current, tier })
}

export function stepSelectedLayer(
  session: EditSession,
  direction: 'forward' | 'backward',
): EditSession {
  const selection = session.selection
  const current = selectedFree(session)
  if (!selection || !current) return session
  const layout = activeDraftLayout(session)
  const freeWidgets = BLOCK_IDS.flatMap((blockId) => {
    const placement = layout.widgets[blockId]
    return placement?.kind === 'free'
      ? [{ kind: 'widget' as const, id: blockId, layer: placement.layer }]
      : []
  })
  const freeStacks = (layout.stacks ?? []).map((stack) => ({
    kind: 'stack' as const,
    id: stack.id,
    layer: stack.layer,
  }))
  const candidates = [...freeWidgets, ...freeStacks]
    .filter((entry) => !(entry.kind === selection.kind && entry.id === selection.id) && (
      direction === 'forward'
        ? entry.layer > current.layer
        : entry.layer < current.layer
    ))
    .sort((a, b) => (
      direction === 'forward'
        ? a.layer - b.layer
        : b.layer - a.layer
    ))
  const neighbor = candidates[0]
  if (!neighbor) return session
  return commit(session, withActiveLayout(session.draft, (draftLayout) => {
    const widgets = { ...draftLayout.widgets }
    const stacks = draftLayout.stacks?.map((stack) => {
      if (selection.kind === 'stack' && stack.id === selection.id) {
        return { ...stack, layer: neighbor.layer }
      }
      if (neighbor.kind === 'stack' && stack.id === neighbor.id) {
        return { ...stack, layer: current.layer }
      }
      return stack
    })
    if (selection.kind === 'widget') {
      const placement = widgets[selection.id]
      if (placement?.kind === 'free') widgets[selection.id] = { ...placement, layer: neighbor.layer }
    }
    if (neighbor.kind === 'widget') {
      const placement = widgets[neighbor.id]
      if (placement?.kind === 'free') widgets[neighbor.id] = { ...placement, layer: current.layer }
    }
    return { ...draftLayout, widgets, ...(stacks ? { stacks } : {}) }
  }))
}

export function hideSelected(session: EditSession): EditSession {
  const selection = session.selection
  if (!selection) return session
  const next = selection.kind === 'stack'
    ? commitActiveLayoutUpdate(session, (layout) => hideStack(layout, selection.id))
    : commit(session, withActiveLayout(session.draft, (layout) => ({
      ...layout,
      widgets: { ...layout.widgets, [selection.id]: { kind: 'hidden' } },
    })))
  if (next === session) return session
  return { ...next, selection: null, selectedId: null }
}

export function restoreSelectedDefaults(session: EditSession): EditSession {
  const selection = session.selection
  if (selection?.kind !== 'widget') return session
  const id = selection.id
  const current = activeDraftLayout(session).widgets[id]
  const layer = current?.kind === 'free' ? current.layer : BLOCK_IDS.indexOf(id)
  return commit(session, withActiveLayout(session.draft, (layout) => ({
    ...layout,
    widgets: { ...layout.widgets, [id]: defaultFreePlacement(id, layer) },
  })))
}

/** Un-hides a widget hidden in this layout, returning it to its designed
 *  default slot (review fix I2: Hide must never be a dead end — the toolbar
 *  lists hidden widgets and restores them through this). */
export function restoreHiddenWidget(session: EditSession, id: BlockId): EditSession {
  const layout = activeDraftLayout(session)
  if (layout.widgets[id]?.kind !== 'hidden') return session
  let maxLayer = -1
  for (const blockId of BLOCK_IDS) {
    const placement = layout.widgets[blockId]
    if (placement?.kind === 'free') maxLayer = Math.max(maxLayer, placement.layer)
  }
  return commit(session, withActiveLayout(session.draft, (draftLayout) => ({
    ...draftLayout,
    widgets: {
      ...draftLayout.widgets,
      [id]: defaultFreePlacement(id, maxLayer + 1 + BLOCK_IDS.indexOf(id)),
    },
  })))
}

export function applyBulkTier(session: EditSession, tier: WidgetTier): EditSession {
  return commit(session, withActiveLayout(session.draft, (layout) => {
    const widgets = { ...layout.widgets }
    for (const id of BLOCK_IDS) {
      const placement = widgets[id]
      if (placement?.kind === 'free') widgets[id] = { ...placement, tier }
    }
    const stacks = layout.stacks?.map((stack) => ({ ...stack, tier }))
    return { ...layout, widgets, ...(stacks ? { stacks } : {}), bulkTier: tier }
  }))
}

export function createStackFromDrop(
  session: EditSession,
  sourceId: BlockId,
  target: StackDropTarget,
  newStackId: string,
  pushUndo = true,
): EditSession {
  const next = commitActiveLayoutUpdate(
    session,
    (layout) => createOrAppendStack(layout, sourceId, target, newStackId),
    pushUndo,
  )
  if (next === session) return session
  return { ...next, selection: { kind: 'stack', id: target.kind === 'stack' ? target.id : newStackId }, selectedId: null }
}

export function setSelectedStackFacing(session: EditSession, face: BlockId): EditSession {
  const selection = session.selection
  if (selection?.kind !== 'stack') return session
  return commitActiveLayoutUpdate(session, (layout) => setStackFacing(layout, selection.id, face))
}

export function reorderSelectedStackMember(
  session: EditSession,
  memberId: BlockId,
  direction: -1 | 1,
): EditSession {
  const selection = session.selection
  if (selection?.kind !== 'stack') return session
  return commitActiveLayoutUpdate(
    session,
    (layout) => reorderStackMember(layout, selection.id, memberId, direction),
  )
}

export function removeSelectedStackMember(session: EditSession, memberId: BlockId): EditSession {
  const selection = session.selection
  if (selection?.kind !== 'stack') return session
  const next = commitActiveLayoutUpdate(
    session,
    (layout) => removeStackMember(layout, selection.id, memberId),
  )
  if (next === session) return session
  const stackSurvives = activeDraftLayout(next).stacks?.some((stack) => stack.id === selection.id) ?? false
  return stackSurvives ? next : selectWidget(next, memberId)
}

export function detachSelectedStackMember(
  session: EditSession,
  memberId: BlockId,
  point: { xPct: number; yPct: number },
): EditSession {
  const selection = session.selection
  if (selection?.kind !== 'stack') return session
  const next = commitActiveLayoutUpdate(
    session,
    (layout) => detachStackMember(layout, selection.id, memberId, point),
  )
  return next === session ? session : selectWidget(next, memberId)
}

/** A dock's members in order — pure helper for insertion-index math. */
export function dockOrder(layout: NamedLayout, dock: DockEdge): readonly BlockId[] {
  return BLOCK_IDS
    .flatMap((id) => {
      const placement = layout.widgets[id]
      return placement?.kind === 'docked' && placement.dock === dock
        ? [{ id, order: placement.order }]
        : []
    })
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.id)
}

function dockSelectedInternal(
  session: EditSession,
  dock: DockEdge,
  xPct: number,
  pushUndo: boolean,
): EditSession {
  const id = session.selectedId
  if (!id) return session
  const clampedX = Math.min(100, Math.max(0, xPct))
  return commit(session, withActiveLayout(session.draft, (draftLayout) => {
    const widgets = { ...draftLayout.widgets }
    const existing = draftLayout.widgets[id]
    widgets[id] = {
      kind: 'docked',
      dock,
      order: 0,
      x: clampedX,
      ...(existing?.kind === 'docked' && existing.tier ? { tier: existing.tier } : {}),
    }
    // Orders are DERIVED from position (position IS the order now): both
    // edges renumber left-to-right so the narrow stack and validation stay
    // coherent, while every member keeps its exact x, size, and edge.
    for (const edge of ['top', 'bottom'] as const) {
      BLOCK_IDS
        .flatMap((memberId) => {
          const placement = widgets[memberId]
          return placement?.kind === 'docked' && placement.dock === edge
            ? [{ memberId, placement }]
            : []
        })
        .sort((a, b) => dockedXPercent(a.placement) - dockedXPercent(b.placement))
        .forEach(({ memberId, placement }, order) => {
          widgets[memberId] = { ...placement, order }
        })
    }
    return { ...draftLayout, widgets }
  }), pushUndo)
}

/** Docks the selected widget with its CENTER at `xPct` percent of the
 *  edge's strip (named-layouts spec 2.4, owner-refined 2026-08-18: complete
 *  control — any position within the bar, exactly like the canvas). Orders
 *  in both docks are derived from position. Never called automatically. */
export function dockSelected(session: EditSession, dock: DockEdge, xPct: number): EditSession {
  return dockSelectedInternal(session, dock, xPct, true)
}

/** The drop half of a zone-drag gesture: the drag's first move already
 *  pushed the gesture's one undo entry (review fix I2 — one entry per
 *  gesture), so this variant reuses it. */
export function dockSelectedLive(session: EditSession, dock: DockEdge, xPct: number): EditSession {
  return dockSelectedInternal(session, dock, xPct, false)
}

function undockSelectedInternal(
  session: EditSession,
  point: { xPct: number; yPct: number },
  pushUndo: boolean,
): EditSession {
  const id = session.selectedId
  if (!id) return session
  const layout = activeDraftLayout(session)
  if (layout.widgets[id]?.kind !== 'docked') return session
  let maxLayer = -1
  for (const blockId of BLOCK_IDS) {
    const placement = layout.widgets[blockId]
    if (placement?.kind === 'free') maxLayer = Math.max(maxLayer, placement.layer)
  }
  return commit(session, withActiveLayout(session.draft, (draftLayout) => ({
    ...draftLayout,
    widgets: {
      ...draftLayout.widgets,
      [id]: freePlacementFromPoint({
        x: point.xPct,
        y: point.yPct,
        tier: 'standard',
        layer: maxLayer + 1 + BLOCK_IDS.indexOf(id),
      }),
    },
  })), pushUndo)
}

/** Returns a docked selected widget to free placement at the drop point.
 *  The docked form stored no tier, so the undocked widget starts Standard
 *  (clamped per widget by the renderer); remembering the pre-dock tier is
 *  an NL-P5 nicety once Docked tiers are designed. */
export function undockSelected(
  session: EditSession,
  point: { xPct: number; yPct: number },
): EditSession {
  return undockSelectedInternal(session, point, true)
}

/** The live mid-gesture variant (owner-reported 2026-08-18: a drag that
 *  crosses in and out of a dock band must stay ONE undo entry): the
 *  gesture's first operation already pushed, so this one never does. */
export function undockSelectedLive(
  session: EditSession,
  point: { xPct: number; yPct: number },
): EditSession {
  return undockSelectedInternal(session, point, false)
}

export function undo(session: EditSession): EditSession {
  const previous = session.past[session.past.length - 1]
  if (!previous) return session
  return {
    ...session,
    draft: previous,
    past: session.past.slice(0, -1),
    dirty: !documentsEqual(previous, session.baseline),
  }
}

export function resetSession(session: EditSession): EditSession {
  return commit(session, session.baseline)
}
