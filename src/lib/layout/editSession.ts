import {
  cleanLayoutsDocument,
  DOCK_ALIGNS,
  freePlacementFromPoint,
  pointFromFreePlacement,
  type DockAlign,
  type DockEdge,
  type FreeWidgetPlacement,
  type LayoutsDocument,
  type NamedLayout,
  type WidgetTier,
} from './namedLayouts'
import { defaultFreePlacement } from './defaultPlacements'
import { BLOCK_IDS, type BlockId } from './types'

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
    let maxLayer = -1
    for (const id of BLOCK_IDS) {
      const placement = widgets[id]
      if (placement?.kind === 'free') maxLayer = Math.max(maxLayer, placement.layer)
    }
    for (const id of BLOCK_IDS) {
      if (!enabled.has(id) || widgets[id]) continue
      widgets[id] = defaultFreePlacement(id, maxLayer + 1 + BLOCK_IDS.indexOf(id))
    }
    return { ...layout, widgets }
  })
  return {
    baseline: materialized,
    draft: materialized,
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

export function selectWidget(session: EditSession, id: BlockId | null): EditSession {
  return { ...session, selectedId: id }
}

function selectedFree(session: EditSession): FreeWidgetPlacement | null {
  if (!session.selectedId) return null
  const placement = activeDraftLayout(session).widgets[session.selectedId]
  return placement?.kind === 'free' ? placement : null
}

function replaceSelected(
  session: EditSession,
  placement: FreeWidgetPlacement,
  pushUndo = true,
): EditSession {
  const id = session.selectedId
  if (!id) return session
  return commit(session, withActiveLayout(session.draft, (layout) => ({
    ...layout,
    widgets: { ...layout.widgets, [id]: placement },
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
  const current = selectedFree(session)
  if (!current) return session
  return replaceSelected(session, { ...current, tier })
}

export function stepSelectedLayer(
  session: EditSession,
  direction: 'forward' | 'backward',
): EditSession {
  const id = session.selectedId
  const current = selectedFree(session)
  if (!id || !current) return session
  const layout = activeDraftLayout(session)
  const free = BLOCK_IDS.flatMap((blockId) => {
    const placement = layout.widgets[blockId]
    return placement?.kind === 'free' ? [{ id: blockId, placement }] : []
  })
  const candidates = free
    .filter((entry) => entry.id !== id && (
      direction === 'forward'
        ? entry.placement.layer > current.layer
        : entry.placement.layer < current.layer
    ))
    .sort((a, b) => (
      direction === 'forward'
        ? a.placement.layer - b.placement.layer
        : b.placement.layer - a.placement.layer
    ))
  const neighbor = candidates[0]
  if (!neighbor) return session
  return commit(session, withActiveLayout(session.draft, (draftLayout) => ({
    ...draftLayout,
    widgets: {
      ...draftLayout.widgets,
      [id]: { ...current, layer: neighbor.placement.layer },
      [neighbor.id]: { ...neighbor.placement, layer: current.layer },
    },
  })))
}

export function hideSelected(session: EditSession): EditSession {
  const id = session.selectedId
  if (!id) return session
  const next = commit(session, withActiveLayout(session.draft, (layout) => ({
    ...layout,
    widgets: { ...layout.widgets, [id]: { kind: 'hidden' } },
  })))
  return { ...next, selectedId: null }
}

export function restoreSelectedDefaults(session: EditSession): EditSession {
  const id = session.selectedId
  if (!id) return session
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
    return { ...layout, widgets, bulkTier: tier }
  }))
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
  index: number,
  align: DockAlign,
  pushUndo: boolean,
): EditSession {
  const id = session.selectedId
  if (!id) return session
  const layout = activeDraftLayout(session)
  // Members grouped by their stored section (owner direction 2026-08-18:
  // placement WITHIN the bar is the user's too). The index is WITHIN the
  // target section; orders renumber section-major (start, center, end) so
  // they stay unique per dock and the narrow stack reads left-to-right.
  const sections: Record<DockAlign, BlockId[]> = { start: [], center: [], end: [] }
  for (const memberId of dockOrder(layout, dock)) {
    if (memberId === id) continue
    const placement = layout.widgets[memberId]
    sections[placement?.kind === 'docked' ? placement.align ?? 'center' : 'center'].push(memberId)
  }
  const target = sections[align]
  const clamped = Math.min(Math.max(0, Math.trunc(index)), target.length)
  target.splice(clamped, 0, id)
  const otherEdge: DockEdge = dock === 'top' ? 'bottom' : 'top'
  const otherMembers = dockOrder(layout, otherEdge).filter((memberId) => memberId !== id)
  return commit(session, withActiveLayout(session.draft, (draftLayout) => {
    const widgets = { ...draftLayout.widgets }
    let order = 0
    for (const sectionAlign of DOCK_ALIGNS) {
      for (const memberId of sections[sectionAlign]) {
        widgets[memberId] = { kind: 'docked', dock, order: order++, align: sectionAlign }
      }
    }
    otherMembers.forEach((memberId, otherOrder) => {
      const existing = draftLayout.widgets[memberId]
      widgets[memberId] = {
        kind: 'docked',
        dock: otherEdge,
        order: otherOrder,
        align: existing?.kind === 'docked' ? existing.align ?? 'center' : 'center',
      }
    })
    return { ...draftLayout, widgets }
  }), pushUndo)
}

/** Docks the selected widget at the given index within the edge's SECTION
 *  (named-layouts spec 2.4, owner-refined 2026-08-18: a strip has start,
 *  center, and end sections; the drop position picks the section, the index
 *  orders within it). Orders in BOTH docks are renumbered compactly. Never
 *  called automatically. */
export function dockSelected(session: EditSession, dock: DockEdge, index: number, align: DockAlign = 'center'): EditSession {
  return dockSelectedInternal(session, dock, index, align, true)
}

/** The drop half of a zone-drag gesture: the drag's first move already
 *  pushed the gesture's one undo entry (review fix I2 — one entry per
 *  gesture), so this variant reuses it. */
export function dockSelectedLive(session: EditSession, dock: DockEdge, index: number, align: DockAlign = 'center'): EditSession {
  return dockSelectedInternal(session, dock, index, align, false)
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
